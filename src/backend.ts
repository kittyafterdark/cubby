declare const spindle: import('lumiverse-spindle-types').SpindleAPI

const DEFAULT_CONFIG = { version: 1, groups: [] as unknown[] }

spindle.onFrontendMessage(async (payload: any, userId: string) => {
  if (!payload || typeof payload !== 'object') return

  try {
    switch (payload.type) {
      case 'get_config': {
        const config = await spindle.userStorage.getJson('config.json', {
          fallback: DEFAULT_CONFIG,
          userId,
        })
        spindle.sendToFrontend({ type: 'config_loaded', config }, userId)
        break
      }

      case 'save_config': {
        await spindle.userStorage.setJson('config.json', payload.config ?? DEFAULT_CONFIG, {
          indent: 2,
          userId,
        })
        spindle.sendToFrontend({ type: 'config_saved' }, userId)
        break
      }
    }
  } catch (error: any) {
    const message = error?.message ?? String(error)
    spindle.log.error(`Cubby config error: ${message}`)
    spindle.sendToFrontend({ type: 'config_error', error: message }, userId)
  }
})

spindle.log.info('Cubby backend loaded.')
