const mongoose = require('mongoose');

const execute = process.argv.includes('--execute');
const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  throw new Error('MONGO_URI is required');
}

const migrations = [
  {
    source: 'zoom_meetings',
    target: 'meeting_bots',
    uniqueFields: ['deduplicationKey', 'activeMeetingKey'],
    normalizationPipeline: [
      {
        $set: {
          platform: { $ifNull: ['$platform', 'ZOOM'] },
          audioStorageProvider: {
            $ifNull: ['$audioStorageProvider', 'RECALL'],
          },
          audioStorageReference: {
            $ifNull: ['$audioStorageReference', '$recordingId'],
          },
        },
      },
      { $unset: 'audioDownloadUrl' },
    ],
  },
  {
    source: 'zoom_meeting_transcripts',
    target: 'meeting_transcripts',
    uniqueFields: ['meetingId', 'transcriptId'],
    normalizationPipeline: [
      { $set: { platform: { $ifNull: ['$platform', 'ZOOM'] } } },
    ],
  },
];

async function countIdentityOverlap(database, source, target) {
  const result = await database
    .collection(source)
    .aggregate([
      {
        $lookup: {
          from: target,
          localField: '_id',
          foreignField: '_id',
          as: 'targetMatches',
        },
      },
      { $match: { 'targetMatches.0': { $exists: true } } },
      { $count: 'total' },
    ])
    .toArray();
  return result[0]?.total || 0;
}

async function countUniqueConflicts(database, source, target, field) {
  const result = await database
    .collection(source)
    .aggregate([
      { $match: { [field]: { $exists: true, $ne: null } } },
      {
        $lookup: {
          from: target,
          let: { sourceValue: `$${field}`, sourceId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [`$${field}`, '$$sourceValue'] },
                    { $ne: ['$_id', '$$sourceId'] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'conflicts',
        },
      },
      { $match: { 'conflicts.0': { $exists: true } } },
      { $count: 'total' },
    ])
    .toArray();
  return result[0]?.total || 0;
}

async function migrateCollection(database, existing, migration) {
  const { source, target, uniqueFields, normalizationPipeline } = migration;
  if (!existing.has(source)) {
    return { sourceExists: false, targetExists: existing.has(target) };
  }

  const sourceCount = await database.collection(source).countDocuments({});
  const targetExists = existing.has(target);
  const targetCount = targetExists
    ? await database.collection(target).countDocuments({})
    : 0;

  if (!targetExists) {
    console.log(
      `${source}: ${sourceCount} records; ${target} does not exist (${execute ? 'renaming' : 'would rename'})`,
    );
    if (execute) {
      await database.collection(source).rename(target);
      existing.delete(source);
      existing.add(target);
    }
    return { sourceExists: true, targetExists: true };
  }

  const identityOverlap = await countIdentityOverlap(database, source, target);
  const conflicts = {};
  for (const field of uniqueFields) {
    conflicts[field] = await countUniqueConflicts(
      database,
      source,
      target,
      field,
    );
  }
  const conflictTotal = Object.values(conflicts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const copyCount = Math.max(0, sourceCount - identityOverlap);

  console.log(
    `${source}: ${sourceCount}; ${target}: ${targetCount}; matching _id: ${identityOverlap}; new records: ${copyCount}`,
  );
  for (const [field, count] of Object.entries(conflicts)) {
    console.log(`Unique-key conflicts on ${field}: ${count}`);
  }

  if (conflictTotal > 0) {
    const message =
      `Cannot safely merge ${source} into ${target}: ` +
      `${conflictTotal} record(s) conflict on target unique keys`;
    if (execute) throw new Error(message);
    console.log(`BLOCKED: ${message}`);
    return { sourceExists: true, targetExists: true, blocked: true };
  }

  if (execute && sourceCount > 0) {
    await database
      .collection(source)
      .aggregate([
        ...normalizationPipeline,
        {
          $merge: {
            into: target,
            on: '_id',
            whenMatched: 'keepExisting',
            whenNotMatched: 'insert',
          },
        },
      ])
      .toArray();
    console.log(
      `Merged ${copyCount} record(s) into ${target}; preserved ${source} as a rollback copy`,
    );
  } else if (!execute) {
    console.log(
      `Would merge ${copyCount} record(s) into ${target} and preserve ${source}`,
    );
  }

  return { sourceExists: true, targetExists: true };
}

async function normalizeTargets(database, existing) {
  if (existing.has('meeting_bots')) {
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
      console.log(`Normalized ${result.modifiedCount} meeting bot record(s)`);
    } else {
      const count = await database
        .collection('meeting_bots')
        .countDocuments({ platform: { $exists: false } });
      console.log(`Would normalize ${count} meeting bot record(s)`);
    }
  }

  if (existing.has('meeting_transcripts')) {
    if (execute) {
      const result = await database
        .collection('meeting_transcripts')
        .updateMany(
          { platform: { $exists: false } },
          { $set: { platform: 'ZOOM' } },
        );
      console.log(`Normalized ${result.modifiedCount} transcript record(s)`);
    } else {
      const count = await database
        .collection('meeting_transcripts')
        .countDocuments({ platform: { $exists: false } });
      console.log(`Would normalize ${count} transcript record(s)`);
    }
  }
}

async function migrate() {
  await mongoose.connect(mongoUri);
  const database = mongoose.connection.db;
  if (!database) throw new Error('MongoDB connection is unavailable');

  const existing = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray()).map(
      (collection) => collection.name,
    ),
  );

  let blocked = false;
  for (const migration of migrations) {
    const result = await migrateCollection(database, existing, migration);
    blocked ||= result.blocked === true;
  }
  await normalizeTargets(database, existing);

  if (!execute) {
    console.log(
      blocked
        ? 'Dry run only. Resolve reported conflicts before executing.'
        : 'Dry run only. Back up MongoDB, then run migrate:meeting-bots:execute.',
    );
  }
}

migrate()
  .finally(() => mongoose.disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
