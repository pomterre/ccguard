import { Command } from './types'

const createCommand = (
  name: string,
  description: string,
  execute: Command['execute'],
  aliases?: string[]
): Command => ({ name, description, execute, aliases })

export const commands: Command[] = [
  createCommand('on', 'Enable CCGuard enforcement', 
    async (gm) => ({ decision: 'block', reason: await gm.enable().then(() => 'CCGuard has been ENABLED') })),
  
  createCommand('off', 'Disable CCGuard enforcement', 
    async (gm) => ({ decision: 'block', reason: await gm.disable().then(() => 'CCGuard has been DISABLED') })),
  
  createCommand('status', 'Show CCGuard status and session statistics',
    async (gm) => {
      const [isEnabled, stats] = await Promise.all([gm.isEnabled(), gm.getSessionStats()])
      const status = isEnabled ? 'ENABLED' : 'DISABLED'
      let msg = `CCGuard is ${status}\n\n`
      if (stats) {
        msg += `Session Statistics:\n`
        msg += `   Lines added: ${stats.totalLinesAdded}\n`
        msg += `   Lines removed: ${stats.totalLinesRemoved}\n`
        msg += `   Net change: ${stats.netChange > 0 ? '+' : ''}${stats.netChange}\n`
        msg += `   Operations: ${stats.operationCount}`
      } else {
        msg += 'No operations tracked yet in this session.'
      }
      return { decision: 'block', reason: msg }
    }),
  
  createCommand('reset', 'Reset session statistics',
    async (gm) => {
      await gm.resetStats()
      return { decision: 'block', reason: 'Session statistics have been reset.' }
    }),
  
  createCommand('version', 'Show CCGuard version',
    async () => ({ decision: 'block', reason: `CCGuard version 0.1.2` })),
]