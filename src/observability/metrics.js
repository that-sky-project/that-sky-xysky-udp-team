import client from 'prom-client';

export function createMetrics() {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });

  const onlinePlayers = new client.Gauge({
    name: 'xysky_online_players',
    help: 'Current online player count'
  });

  const connectedPeers = new client.Gauge({
    name: 'xysky_connected_peers',
    help: 'Current ENet peer count'
  });

  const packets = new client.Counter({
    name: 'xysky_packets_total',
    help: 'Total decoded packets',
    labelNames: ['direction', 'type']
  });

  const disconnects = new client.Counter({
    name: 'xysky_disconnects_total',
    help: 'Total disconnects',
    labelNames: ['reason']
  });

  const packetErrors = new client.Counter({
    name: 'xysky_packet_errors_total',
    help: 'Total packet processing errors',
    labelNames: ['reason']
  });

  const packetBytes = new client.Counter({
    name: 'xysky_packet_bytes_total',
    help: 'Total packet bytes',
    labelNames: ['direction']
  });

  const packetDuration = new client.Histogram({
    name: 'xysky_packet_process_seconds',
    help: 'Packet processing duration in seconds',
    labelNames: ['type'],
    buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1]
  });

  registry.registerMetric(onlinePlayers);
  registry.registerMetric(connectedPeers);
  registry.registerMetric(packets);
  registry.registerMetric(disconnects);
  registry.registerMetric(packetErrors);
  registry.registerMetric(packetBytes);
  registry.registerMetric(packetDuration);

  return {
    registry,
    onlinePlayers,
    connectedPeers,
    packets,
    disconnects,
    packetErrors,
    packetBytes,
    packetDuration
  };
}
