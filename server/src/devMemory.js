// Zero-setup dev mode: runs the API on a throwaway in-memory MongoDB, seeded with demo data.
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('icl');
await import('./seed.js');
await import('./index.js');
process.on('SIGINT', async () => { await mongo.stop(); process.exit(0); });
