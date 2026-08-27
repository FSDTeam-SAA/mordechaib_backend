const mongoose = require('mongoose');

const execute = process.argv.includes('--execute');
const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  throw new Error('MONGO_URI is required');
}

const collectionRenames = [
  ['zoom_meetings', 'meeting_bots'],
  ['zoom_meeting_transcripts', 'meeting_transcripts'],
];

async function migrate() {
  await mongoose.connect(mongoUri);
  const database = mongoose.connection.db;
  if (!database) throw new Error('MongoDB connection is unavailable');

  const existing = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray()).map(
      (collection) => collection.name,
    ),
  );

  for (const [source, target] of collectionRenames) {
    if (existing.has(source) && existing.has(target)) {
      const targetCount = await database.collection(target).countDocuments({});
      if (targetCount > 0) {
        throw new Error(
          `Both ${source} and non-empty ${target} exist. Resolve the collections manually before migration.`,
        );
      }
      if (execute) {
        await database.collection(target).drop();
        existing.delete(target);
        console.log(`Removed empty auto-created ${target} collection`);
      } else {
        console.log(`Would replace empty auto-created ${target} collection`);
      }
    }
    if (existing.has(source)) {
      if (execute) {
        await database.collection(source).rename(target);
        existing.delete(source);
        existing.add(target);
        console.log(`Renamed ${source} to ${target}`);
      } else {
        console.log(`Would rename ${source} to ${target}`);
      }
    }
  }

  const botsCollection = execute
    ? existing.has('meeting_bots')
    : existing.has('meeting_bots') || existing.has('zoom_meetings');
  if (botsCollection) {
    if (execute) {
      const result = await database
        .collection('meeting_bots')
        .updateMany({ platform: { $exists: false } }, [
          {
            $set: {
              platform: 'ZOOM',
              audioStorageProvider: {
                $ifNull: ['$audioStorageProvider', 'RECALL'],
              },
              audioStorageReference: {
                $ifNull: ['$audioStorageReference', '$recordingId'],
              },
            },
          },
          { $unset: 'audioDownloadUrl' },
        ]);
      console.log(`Updated ${result.modifiedCount} meeting bot records`);
    } else {
      console.log('Would mark legacy meeting bot records as ZOOM');
    }
  }

  const transcriptsCollection = execute
    ? existing.has('meeting_transcripts')
    : existing.has('meeting_transcripts') ||
      existing.has('zoom_meeting_transcripts');
  if (transcriptsCollection) {
    if (execute) {
      const result = await database
        .collection('meeting_transcripts')
        .updateMany(
          { platform: { $exists: false } },
          { $set: { platform: 'ZOOM' } },
        );
      console.log(`Updated ${result.modifiedCount} transcript records`);
    } else {
      console.log('Would mark legacy transcript records as ZOOM');
    }
  }

  if (!execute) {
    console.log(
      'Dry run only. Back up MongoDB, then run migrate:meeting-bots:execute.',
    );
  }
}

migrate()
  .finally(() => mongoose.disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
