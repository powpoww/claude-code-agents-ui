import { providerRegistry } from '../../../utils/providers/registry'

export default defineEventHandler(async () => {
  const providers = providerRegistry.getAllInfo()

  return {
    providers,
    default: 'claude',
  }
})
