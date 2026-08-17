export function handleDisconnect(session, _payload, { logger }) {
  logger.debug({ sessionId: session.id }, 'client requested disconnect');
}
