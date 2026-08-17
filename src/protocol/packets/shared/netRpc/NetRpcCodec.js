
export const CLASS_ID_LENGTH = 7;
export const HEADER_LENGTH = 10;

/**
 * 从 rpcData 解析 NetRpc 消息头部。
 * @param {Buffer} rpcData
 * @returns {{ classIdKey: string, sender: number, receiver: number, typeFlag: number } | null}
 */
export function decodeNetRpcHeader(rpcData) {
  if (!Buffer.isBuffer(rpcData) || rpcData.length < HEADER_LENGTH) {
    return null;
  }

  return {
    classIdKey: rpcData.subarray(0, CLASS_ID_LENGTH).toString('hex'),
    sender:     rpcData[7],
    receiver:   rpcData[8],
    typeFlag:   rpcData[9]
  };
}

/**
 * 将 class_id（Buffer 或字节数组）转换为路由 key。
 * @param {Buffer | number[]} classId
 * @returns {string}
 */
export function classIdKey(classId) {
  return (Buffer.isBuffer(classId) ? classId : Buffer.from(classId)).toString('hex');
}
