const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

async function testLocalLaunch() {
  console.log('[Test Local DB] Checking binary download / cache...');
  const dbPath = path.join(__dirname, '../data/test_db');
  if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27018,
      dbPath: dbPath,
      storageEngine: 'wiredTiger',
    },
    autoStart: true,
  });

  const uri = mongod.getUri();
  console.log('[Test Local DB] MongoMemoryServer running at:', uri);

  await mongoose.connect(uri);
  console.log('[Test Local DB] Mongoose connected successfully to local MongoDB instance!');

  const TestModel = mongoose.model('TestDoc', new mongoose.Schema({ name: String, createdAt: { type: Date, default: Date.now } }));
  const doc = await TestModel.create({ name: 'Peyala Local Test' });
  console.log('[Test Local DB] Created test document:', doc._id, doc.name);

  const found = await TestModel.findById(doc._id);
  console.log('[Test Local DB] Retrieved test document:', found.name);

  await mongoose.disconnect();
  await mongod.stop();
  console.log('[Test Local DB] Stopped cleanly!');
}

testLocalLaunch().catch((err) => {
  console.error('[Test Local DB Error]', err);
  process.exit(1);
});
