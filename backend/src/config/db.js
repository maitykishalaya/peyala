const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/peyala';
  try {
    const conn = await mongoose.connect(uri, {
      maxPoolSize: 25, // Maintain up to 25 warm socket connections for multi-device concurrent operations
      minPoolSize: 5,  // Keep at least 5 warm connections open (zero cold-connection delay)
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,       // Enforce IPv4 to eliminate slow IPv6 DNS lookups on Windows
    });
    console.log(`[Peyala Backend] MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[Peyala Backend] MongoDB Error: ${error.message}`);
    console.error(`[Peyala Backend] Ensure MONGODB_URI is correctly set in environment variables or a local MongoDB service is running.`);
    process.exit(1);
  }
};

module.exports = connectDB;
