/** Lightweight storage marker inspection with no Angular, SQLite, or replica-runtime imports. @experimental */
/** Persistent identity of an explicitly disposable local replica, independent of the wire protocol. */
export interface OfflineStorageGenerationOptions {
  markerStore: { get(options: { key: string }): Promise<{ value: string | null }> };
  generationKey: string;
  markerKey: string;
  generation: string | (() => Promise<string>);
}

/** Reads the generation and durable reset intent without opening or modifying any replica. */
export async function inspectOfflineStorageGeneration(
  options: OfflineStorageGenerationOptions,
): Promise<{ generation: string; matches: boolean; requested: boolean }> {
  const generation = typeof options.generation === 'string' ? options.generation : await options.generation();
  const [stored, marker] = await Promise.all([
    options.markerStore.get({ key: options.generationKey }),
    options.markerStore.get({ key: options.markerKey }),
  ]);
  return { generation, matches: stored.value === generation, requested: marker.value === 'requested' };
}
