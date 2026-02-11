import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Execute deployment: pull latest code, install deps, restart service
 * @returns {Promise<{success: boolean, output: string}>}
 */
export async function deploy() {
  const steps = [
    { name: 'git pull', cmd: 'git pull origin main' },
    { name: 'npm ci', cmd: 'npm ci --production' },
    { name: 'restart', cmd: 'sudo systemctl restart issue-triage' },
  ];

  const output = [];
  
  for (const step of steps) {
    try {
      const { stdout, stderr } = await execAsync(step.cmd, {
        cwd: '/home/jeff/projects/atriumn-issue-triage',
        timeout: 60000, // 1 minute timeout
      });
      output.push(`✅ ${step.name}: ${stdout}${stderr}`);
    } catch (err) {
      output.push(`❌ ${step.name} failed: ${err.message}`);
      return { success: false, output: output.join('\n') };
    }
  }

  return { success: true, output: output.join('\n') };
}
