
export const GIFT_CLASS_ID = Buffer.from([0xb3, 0xb9, 0xd9, 0x20, 0x00, 0x24, 0x00]);

export const GiftTypeFlag = Object.freeze({
  Offer:    0,
  Accept:   1,
  Complete: 2,
  Cancel:   3
});

const RECEIVER_UUID_OFFSET = 18;
const RECEIVER_UUID_LENGTH = 16;
const MIN_GIFT_LENGTH = RECEIVER_UUID_OFFSET + RECEIVER_UUID_LENGTH;

/** Decode a gift RPC payload into a structured object. */
export function decodeGiftRpc(rpcData) {
  if (!Buffer.isBuffer(rpcData) || rpcData.length < MIN_GIFT_LENGTH) {
    return null;
  }

  return {
    senderSlot:   rpcData[7],
    receiverSlot: rpcData[8],
    typeFlag:     rpcData[9],
    abilityId:    rpcData.readUInt32LE(10),
    itemCount:    rpcData.readUInt32LE(14),
    receiverUuid: rpcData.subarray(RECEIVER_UUID_OFFSET, RECEIVER_UUID_OFFSET + RECEIVER_UUID_LENGTH)
  };
}

/**
 * Return a copy of rpcData with receiverUuid patched in.
 * Called by the server when forwarding a type_flag=Accept message to the sender:
 * the client needs a non-zero UUID here to complete /account/give_candle.
 */
export function patchGiftReceiverUuid(rpcData, uuidBytes) {
  const patched = Buffer.from(rpcData);
  uuidBytes.copy(patched, RECEIVER_UUID_OFFSET);
  return patched;
}
