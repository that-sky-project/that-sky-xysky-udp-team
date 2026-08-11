import fastify from 'fastify';

export async function createHttpServer({ config, logger, room, metrics }) {
  const app = fastify({
    loggerInstance: logger
  });

  app.get('/', async () => ({
    ok: true,
    endpoints: [
      '/health',
      '/rooms',
      '/players',
      '/levels',
      '/metrics',
      '/move/targets',
      '/move/pending'
    ]
  }));

  app.get('/health', async () => ({
    ok: true,
    room: room.getStatus()
  }));

  app.get('/rooms', async () => room.getStatus());

  app.get('/move/targets', async () => ({
    targets: room.rooms.list()
  }));

  app.get('/move/pending', async () => ({
    moves: room.moveService.listPending()
  }));

  app.get('/players', async () => ({
    count: room.players.size,
    players: room.players.list().map(player => player.toApi())
  }));

  app.get('/players/:id', async (request, reply) => {
    const player = room.players.getById(Number(request.params.id));
    if (!player) {
      reply.code(404);
      return { ok: false, error: 'player_not_found' };
    }

    return player.toApi();
  });

  app.get('/levels', async () => ({
    levels: room.levels.toApi()
  }));

  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  return {
    app,
    listen: () => app.listen({ host: config.host, port: config.port }),
    close: () => app.close()
  };
}
