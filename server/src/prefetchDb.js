// Downloads the in-memory MongoDB binary ahead of time so the first start is quick.
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
await mongo.stop();
console.log('Built-in database ready.');
