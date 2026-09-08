// NetRpc 通用消息头部结构（所有 NetRpc 消息共享前10字节）：
//
//   [0..6]  class_id     u8[7]  MetaClass 标识（区分消息类型）
//   [7]     sender       u8     发送方玩家 slot
//   [8]     receiver     u8     接收方玩家 slot
//   [9]     type_flag    u8     消息子类型（各消息类自定义含义）
//   [10..]  body                消息体

export const CLASS_ID_LENGTH = 7;
export const HEADER_LENGTH = 10; // class_id(7) + sender(1) + receiver(1) + type_flag(1)

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
