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

  // Restart in background after a short delay (let webhook response complete)
  setTimeout(() => {
    execAsync('sudo systemctl restart issue-triage', {
      cwd: '/home/jeff/projects/atriumn-issue-triage',
      timeout: 10000,
    }).catch(err => {
      console.error('Restart failed:', err.message);
    });
  }, 1000);

  output.push('✅ restart: scheduled');
  return { success: true, output: output.join('\n') };
}
