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

    const records = [];
    for (const staff of staffList) {
      // Enforce monthly leave cap: max 4 leaves/month per staff. Additional leaves become 'absent'.
      let statusToSave = status;
      let noteToSave = note;

      if (status === 'leave') {
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

    let statusToSave = status;
    let noteToSave = note;

    if (status === 'leave') {
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
    const leavesTakenYear = records.filter((item) => item.status === 'leave').length;
    const leavesRemainingYear = Math.max(24 - leavesTakenYear, 0);

    const result = { present, absent, leavesTaken: leavesTakenYear, leavesRemaining: leavesRemainingYear };

    if (month) {
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
      const recordsMonth = await Attendance.find({ staff: staffId, date: { $gte: monthStart, $lte: monthEnd } });
      const leavesTakenMonth = recordsMonth.filter((r) => r.status === 'leave').length;
      const monthLeavesRemaining = Math.max(4 - leavesTakenMonth, 0);
      result.leavesTakenMonth = leavesTakenMonth;
      result.leavesRemainingMonth = monthLeavesRemaining;
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
