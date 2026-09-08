// Sky.exe passes 0x2100 as the decoded snapshot buffer limit for both
// PlayerState and NetLevelData.
export const SNAPSHOT_MAX_DATA_BYTES = 0x2100;

// NetLevelData reserves 0x2000 bytes after its fixed header.  This is a
// payload limit, separate from the snapshot frame limit above.
export const NET_LEVEL_DATA_MAX_BYTES = 0x2000;

// The latest client sender requires serialized PlayerState size < 0x4b6.
export const PLAYER_STATE_MAX_BYTES = 0x4b5;
