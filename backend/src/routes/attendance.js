const router = require('express').Router();
const Attendance = require('../models/Attendance');
const Staff = require('../models/Staff');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');

const adminOrManager = (req, res, next) => {
  if (!['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Admin or manager access required' });
  }
  next();
};

const normalizeStatus = (status) => {
  const value = String(status || '').trim().toLowerCase();
  if (['halfday', 'half-day', 'holiday'].includes(value)) return 'halfday';
  if (['present', 'absent', 'leave'].includes(value)) return value;
  return 'present';
};

const formatDateKey = (dateValue) => {
  const date = new Date(dateValue);
  const utc = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return utc.toISOString().slice(0, 10);
};

const normalizeDate = (value) => {
  // If value is a YYYY-MM-DD string, construct a local-date to avoid timezone shifts.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

router.use(auth);

// GET /api/attendance?month=&year=&staffId=
router.get('/', async (req, res) => {
  try {
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const staffId = req.query.staffId;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const query = { date: { $gte: startDate, $lte: endDate } };
    if (staffId) query.staff = staffId;

    const records = await Attendance.find(query)
      .populate('staff', 'name status')
      .sort('staff date');

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/attendance
router.post('/', adminOrManager, async (req, res) => {
  try {
    const { date, status, note, staffIds, staffId } = req.body;
    const staffList = Array.isArray(staffIds) ? staffIds : staffId ? [staffId] : [];

    if (!date || !status || staffList.length === 0) {
      return res.status(400).json({ message: 'Date, status and staffId/staffIds are required' });
    }

    const attendanceDate = normalizeDate(date);
    const today = normalizeDate(new Date());
    if (attendanceDate > today) {
      return res.status(400).json({ message: 'Cannot mark future dates' });
    }

    const normalizedStatus = normalizeStatus(status);
    const records = [];
    for (const staff of staffList) {
      // Enforce monthly leave cap: max 4 leaves/month per staff. Additional leaves become 'absent'.
      let statusToSave = normalizedStatus;
      let noteToSave = note;

      if (normalizedStatus === 'leave') {
        const monthStart = new Date(attendanceDate.getFullYear(), attendanceDate.getMonth(), 1);
        const monthEnd = new Date(attendanceDate.getFullYear(), attendanceDate.getMonth() + 1, 0, 23, 59, 59, 999);
        // Count existing leave records for this staff in the month
        const existingLeaves = await Attendance.countDocuments({ staff, date: { $gte: monthStart, $lte: monthEnd }, status: 'leave' });
        // If there is already a leave for this exact date, don't double-count (we will overwrite)
        const existingRecordForDate = await Attendance.findOne({ staff, date: attendanceDate });
        const alreadyLeaveOnDate = existingRecordForDate && existingRecordForDate.status === 'leave';
        const effectiveLeaves = alreadyLeaveOnDate ? existingLeaves : existingLeaves;

        if (!alreadyLeaveOnDate && effectiveLeaves >= 4) {
          statusToSave = 'absent';
          noteToSave = noteToSave ? noteToSave + ' (exceeded monthly leave limit, counted as absent)' : 'Exceeded monthly leave limit — counted as absent';
        }
      }

      const record = await Attendance.findOneAndUpdate(
        { staff, date: attendanceDate },
        { staff, date: attendanceDate, status: statusToSave, note: noteToSave, markedBy: req.user._id },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      records.push(record);
    }

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Attendance',
      description: `${req.user.name} marked attendance for ${records.length} staff on ${attendanceDate.toISOString().split('T')[0]}`,
      metadata: { requestedStatus: status }
    });

    res.status(201).json(records);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/attendance/:id
router.put('/:id', adminOrManager, async (req, res) => {
  try {
    const { status, note } = req.body;
    const existing = await Attendance.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Attendance record not found' });

    const normalizedStatus = normalizeStatus(status);
    let statusToSave = normalizedStatus;
    let noteToSave = note;

    if (normalizedStatus === 'leave') {
      const attendanceDate = normalizeDate(existing.date);
      const monthStart = new Date(attendanceDate.getFullYear(), attendanceDate.getMonth(), 1);
      const monthEnd = new Date(attendanceDate.getFullYear(), attendanceDate.getMonth() + 1, 0, 23, 59, 59, 999);
      // Count leave records in month excluding this record
      const existingLeaves = await Attendance.countDocuments({
        staff: existing.staff,
        date: { $gte: monthStart, $lte: monthEnd },
        status: 'leave',
        _id: { $ne: existing._id }
      });
      if (existingLeaves >= 4) {
        statusToSave = 'absent';
        noteToSave = noteToSave ? noteToSave + ' (exceeded monthly leave limit, counted as absent)' : 'Exceeded monthly leave limit — counted as absent';
      }
    }

    const record = await Attendance.findByIdAndUpdate(
      req.params.id,
      { status: statusToSave, note: noteToSave },
      { new: true }
    );

    if (!record) return res.status(404).json({ message: 'Attendance record not found' });

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Attendance',
      description: `${req.user.name} updated attendance for ${record.staff} on ${record.date.toISOString().split('T')[0]}`,
    });

    res.json(record);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET /api/attendance/summary/:staffId
// Optional query params: month, year — if provided, returns monthly leavesTaken/monthLeavesRemaining
router.get('/summary/:staffId', async (req, res) => {
  try {
    const staffId = req.params.staffId;
    const member = await Staff.findById(staffId);
    if (!member) return res.status(404).json({ message: 'Staff not found' });

    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = req.query.month ? parseInt(req.query.month, 10) : null; // 1-12

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

    const records = await Attendance.find({
      staff: staffId,
      date: { $gte: startDate, $lte: endDate },
    });

    const present = records.filter((item) => item.status === 'present').length;
    const absent = records.filter((item) => item.status === 'absent').length;
    const halfDay = records.filter((item) => ['halfday', 'holiday'].includes(item.status)).length;
    const leavesTakenYear = records.filter((item) => item.status === 'leave').length;
    const leavesRemainingYear = Math.max(24 - leavesTakenYear, 0);

    const result = {
      present,
      absent,
      halfDay,
      leavesTaken: leavesTakenYear,
      leavesRemaining: leavesRemainingYear,
    };

    if (month) {
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
      const recordsMonth = await Attendance.find({ staff: staffId, date: { $gte: monthStart, $lte: monthEnd } });
      const presentMonth = recordsMonth.filter((r) => r.status === 'present').length;
      const absentMonth = recordsMonth.filter((r) => r.status === 'absent').length;
      const halfDayMonth = recordsMonth.filter((r) => ['halfday', 'holiday'].includes(r.status)).length;
      const leavesTakenMonth = recordsMonth.filter((r) => r.status === 'leave').length;
      const monthLeavesRemaining = Math.max(4 - leavesTakenMonth, 0);
      const notes = recordsMonth
        .filter((r) => r.note && String(r.note).trim())
        .map((r) => ({
          id: r._id.toString(),
          date: formatDateKey(r.date),
          status: r.status,
          note: String(r.note).trim(),
        }));

      result.presentMonth = presentMonth;
      result.absentMonth = absentMonth;
      result.halfDayMonth = halfDayMonth;
      result.leavesTakenMonth = leavesTakenMonth;
      result.leavesRemainingMonth = monthLeavesRemaining;
      result.notes = notes;
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Time duration helpers ─────────────────────────────────────────
const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return null;
  const [h, m] = timeStr.trim().split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

const calculateShiftMinutes = (entry, exit) => {
  const entryMin = timeToMinutes(entry);
  const exitMin = timeToMinutes(exit);
  if (entryMin === null || exitMin === null) return 0;
  if (exitMin >= entryMin) {
    return exitMin - entryMin;
  } else {
    // Cross-midnight / overnight shift
    return (1440 - entryMin) + exitMin;
  }
};

// GET /api/attendance/time-logs?date=YYYY-MM-DD
router.get('/time-logs', async (req, res) => {
  try {
    const targetDate = req.query.date ? normalizeDate(req.query.date) : normalizeDate(new Date());
    const staffList = await Staff.find({ status: 'active', logDutyHours: { $ne: false } }).sort('name');
    const attendanceRecords = await Attendance.find({ date: targetDate });

    const attMap = {};
    attendanceRecords.forEach((r) => {
      attMap[r.staff.toString()] = r;
    });

    const logs = staffList.map((s) => ({
      staff: s,
      record: attMap[s._id.toString()] || null,
    }));

    res.json({ date: formatDateKey(targetDate), logs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/attendance/time-log
// Manager or Admin only
router.post('/time-log', adminOrManager, async (req, res) => {
  try {
    const {
      staffId,
      date,
      dutyHours,
      dailySalary,
      shift1,
      shift2,
      timeSlots,
      note,
      penaltyReason,
      penaltyAmount,
    } = req.body;

    if (!staffId || !date) {
      return res.status(400).json({ message: 'Staff member and date are required' });
    }

    const staffMember = await Staff.findById(staffId);
    if (!staffMember) {
      return res.status(404).json({ message: 'Staff member not found' });
    }
    if (staffMember.logDutyHours === false) {
      return res.status(400).json({
        message: `Duty hours tracking is disabled for ${staffMember.name}. Please mark attendance directly on the monthly calendar.`,
      });
    }

    const numDutyHours = parseFloat(dutyHours);
    if (isNaN(numDutyHours) || numDutyHours <= 0) {
      return res.status(400).json({ message: 'Target duty hours is mandatory and must be greater than 0' });
    }

    const numDailySalary = parseFloat(dailySalary);
    if (isNaN(numDailySalary) || numDailySalary <= 0) {
      return res.status(400).json({ message: 'Gross daily salary is mandatory and must be greater than 0' });
    }

    const numPenaltyAmount = Math.max(0, parseFloat(penaltyAmount) || 0);
    const cleanPenaltyReason = penaltyReason ? String(penaltyReason).trim() : '';

    const attendanceDate = normalizeDate(date);
    const today = normalizeDate(new Date());
    if (attendanceDate > today) {
      return res.status(400).json({ message: 'Cannot mark future dates' });
    }

    // Determine slots from timeSlots array or fallback to shift1/shift2
    let rawSlots = [];
    if (Array.isArray(timeSlots) && timeSlots.length > 0) {
      rawSlots = timeSlots;
    } else {
      if (shift1 && (shift1.entry || shift1.exit)) rawSlots.push(shift1);
      if (shift2 && (shift2.entry || shift2.exit)) rawSlots.push(shift2);
    }

    const cleanSlots = rawSlots.map((s) => ({
      entry: s?.entry ? String(s.entry).trim() : '',
      exit: s?.exit ? String(s.exit).trim() : '',
    }));

    const slotsToSave = cleanSlots.length > 0 ? cleanSlots : [{ entry: '', exit: '' }];

    // Calculate total minutes across all timing slots
    let totalMinutes = 0;
    slotsToSave.forEach((slot) => {
      totalMinutes += calculateShiftMinutes(slot.entry, slot.exit);
    });

    const totalPresentHours = +(totalMinutes / 60).toFixed(2);
    const absentHours = Math.max(0, +(numDutyHours - totalPresentHours).toFixed(2));
    const hourlyRate = +(numDailySalary / numDutyHours).toFixed(2);
    const deductionAmount = +(absentHours * hourlyRate).toFixed(2);
    const payableAmount = Math.max(0, +(numDailySalary - deductionAmount - numPenaltyAmount).toFixed(2));

    // Auto-mark attendance: if any entry time is logged -> present, otherwise -> absent
    const hasEntry = slotsToSave.some((slot) => slot.entry && String(slot.entry).trim() !== '');
    const autoStatus = hasEntry ? 'present' : 'absent';

    const record = await Attendance.findOneAndUpdate(
      { staff: staffId, date: attendanceDate },
      {
        staff: staffId,
        date: attendanceDate,
        status: autoStatus,
        note: note ? String(note).trim() : undefined,
        markedBy: req.user._id,
        dutyHours: numDutyHours,
        timeSlots: slotsToSave,
        shift1: slotsToSave[0] || { entry: '', exit: '' },
        shift2: slotsToSave[1] || { entry: '', exit: '' },
        totalPresentHours,
        absentHours,
        dailySalary: numDailySalary,
        hourlyRate,
        deductionAmount,
        penaltyReason: cleanPenaltyReason,
        penaltyAmount: numPenaltyAmount,
        payableAmount,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('staff', 'name position monthlySalary dailySalary defaultDutyHours logDutyHours');

    // Update staff's saved dailySalary & defaultDutyHours for seamless auto-fill next time
    await Staff.findByIdAndUpdate(staffId, {
      dailySalary: numDailySalary,
      defaultDutyHours: numDutyHours,
    });

    const penaltyDesc = numPenaltyAmount > 0 ? `, penalty: -₹${numPenaltyAmount}${cleanPenaltyReason ? ` (${cleanPenaltyReason})` : ''}` : '';

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Attendance',
      description: `${req.user.name} logged duty time for ${record.staff?.name || staffId} on ${formatDateKey(attendanceDate)}: ${totalPresentHours}h present (${absentHours}h shortage, -₹${deductionAmount}${penaltyDesc})`,
      metadata: {
        dutyHours: numDutyHours,
        totalPresentHours,
        absentHours,
        dailySalary: numDailySalary,
        deductionAmount,
        penaltyAmount: numPenaltyAmount,
        penaltyReason: cleanPenaltyReason,
        payableAmount,
        autoStatus,
      },
    });

    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
