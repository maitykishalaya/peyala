const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const VAULT_PATH = path.join(__dirname, '../../data/offline_vault.json');
const SNAPSHOT_PATH = path.join(__dirname, '../../../restore_points/v10.0.0_baseline/atlas_data_snapshot.json');

class OfflineAuthVault {
  constructor() {
    this.users = new Map();
    this.init();
  }

  init() {
    try {
      // 1. Try reading from persistent vault file first
      if (fs.existsSync(VAULT_PATH)) {
        const raw = fs.readFileSync(VAULT_PATH, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const u of list) {
            if (u && u.email) {
              this.users.set(u.email.toLowerCase(), u);
            }
          }
          console.log(`[OfflineAuthVault] Loaded ${this.users.size} cached user credentials from local vault.`);
        }
      }

      // 2. If vault has no users or doesn't exist, populate from baseline snapshot
      if (this.users.size === 0 && fs.existsSync(SNAPSHOT_PATH)) {
        try {
          const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
          if (Array.isArray(snapshot.users)) {
            for (const u of snapshot.users) {
              if (u && u.email) {
                this.users.set(u.email.toLowerCase(), {
                  id: String(u._id || u.id),
                  _id: String(u._id || u.id),
                  name: u.name,
                  email: u.email.toLowerCase(),
                  password: u.password,
                  role: u.role || 'staff',
                  isActive: u.isActive !== false,
                });
              }
            }
            this.persist();
            console.log(`[OfflineAuthVault] Seeded ${this.users.size} offline accounts from baseline snapshot.`);
          }
        } catch (err) {
          console.warn('[OfflineAuthVault] Error reading snapshot:', err.message);
        }
      }

      // 3. Always ensure Demo Viewer account exists and is valid
      const viewerEmail = 'viewer@peyala.com';
      const existingViewer = this.users.get(viewerEmail);
      if (!existingViewer || !existingViewer.password || !bcrypt.compareSync('peyala123', existingViewer.password)) {
        this.users.set(viewerEmail, {
          id: existingViewer?.id || '6aac004cfdcb97e40c762860',
          _id: existingViewer?._id || '6aac004cfdcb97e40c762860',
          name: 'Demo View',
          email: viewerEmail,
          password: bcrypt.hashSync('peyala123', 10),
          role: 'viewer',
          isActive: true,
        });
        this.persist();
      }
    } catch (err) {
      console.warn('[OfflineAuthVault] Init warning:', err.message);
    }
  }

  persist() {
    try {
      const dataDir = path.dirname(VAULT_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const list = Array.from(this.users.values());
      fs.writeFileSync(VAULT_PATH, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.warn('[OfflineAuthVault] Persist warning:', err.message);
    }
  }

  /**
   * Verify credentials offline without touching MongoDB
   */
  async verifyUser(email, enteredPassword) {
    if (!email || !enteredPassword) return null;
    const cleanEmail = email.trim().toLowerCase();

    // Fast-path for demo viewer
    if (cleanEmail === 'viewer@peyala.com' && enteredPassword === 'peyala123') {
      const u = this.users.get(cleanEmail);
      return {
        id: u?.id || '6aac004cfdcb97e40c762860',
        _id: u?._id || '6aac004cfdcb97e40c762860',
        name: u?.name || 'Demo View',
        email: 'viewer@peyala.com',
        role: 'viewer',
        isActive: true,
        isFirstLogin: false,
      };
    }

    const u = this.users.get(cleanEmail);
    if (!u) return null;
    if (u.isActive === false) return null;

    try {
      let isMatch = false;
      if (u.password.startsWith('$2a$') || u.password.startsWith('$2b$')) {
        isMatch = await bcrypt.compare(enteredPassword, u.password);
      } else {
        isMatch = enteredPassword === u.password;
      }

      if (isMatch) {
        return {
          id: String(u._id || u.id),
          _id: String(u._id || u.id),
          name: u.name,
          email: u.email,
          role: u.role || 'staff',
          isActive: true,
          isFirstLogin: false,
        };
      }
    } catch (err) {
      console.warn('[OfflineAuthVault] Password verify error:', err.message);
    }

    return null;
  }

  /**
   * Look up user by ID (for auth middleware token validation when DB is offline)
   */
  findById(id) {
    if (!id) return null;
    const idStr = String(id);
    for (const u of this.users.values()) {
      if (String(u._id || u.id) === idStr) {
        return {
          _id: u._id || u.id,
          id: u._id || u.id,
          name: u.name,
          email: u.email,
          role: u.role || 'staff',
          isActive: u.isActive !== false,
        };
      }
    }
    return null;
  }

  /**
   * Cache a user from live MongoDB into offline vault
   */
  saveUser(userDoc) {
    if (!userDoc || !userDoc.email) return;
    const email = userDoc.email.toLowerCase();
    const existing = this.users.get(email) || {};

    this.users.set(email, {
      ...existing,
      id: String(userDoc._id || userDoc.id),
      _id: String(userDoc._id || userDoc.id),
      name: userDoc.name,
      email,
      password: userDoc.password || existing.password,
      role: userDoc.role || existing.role || 'staff',
      isActive: userDoc.isActive !== false,
    });
    this.persist();
  }

  /**
   * Sync all users from active database connection
   */
  syncFromDb(userDocs) {
    if (!Array.isArray(userDocs)) return;
    for (const u of userDocs) {
      if (u && u.email) {
        const email = u.email.toLowerCase();
        this.users.set(email, {
          id: String(u._id || u.id),
          _id: String(u._id || u.id),
          name: u.name,
          email,
          password: u.password,
          role: u.role || 'staff',
          isActive: u.isActive !== false,
        });
      }
    }
    this.persist();
    console.log(`[OfflineAuthVault] Synchronized ${this.users.size} user accounts with local vault.`);
  }
}

const offlineAuthVault = new OfflineAuthVault();
module.exports = offlineAuthVault;
