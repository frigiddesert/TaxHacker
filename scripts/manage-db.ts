#!/usr/bin/env tsx

import { spawn } from 'node:child_process'

const composeArgs = ['-f', 'docker-compose.dev.yml']

interface RunOptions {
  allowFailure?: boolean
  silent?: boolean
}

function runCommand(command: string, args: string[], options: RunOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.silent ? 'ignore' : 'inherit',
      shell: false,
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code === 0 || options.allowFailure) {
        resolve(code ?? 0)
      } else {
        const err = new Error(${command}  exited with code )
        // @ts-expect-error augment
        err.code = code
        reject(err)
      }
    })
  })
}

async function runDockerCompose(args: string[], options: RunOptions = {}): Promise<number> {
  try {
    return await runCommand('docker', ['compose', ...args], options)
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return await runCommand('docker-compose', args, options)
    }
    throw error
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function start() {
  await runDockerCompose([...composeArgs, 'up', '-d', 'postgres'])
  console.log('Waiting for PostgreSQL to be ready...')

  const timeoutMs = 30_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const code = await runDockerCompose(
      [...composeArgs, 'exec', '-T', 'postgres', 'pg_isready', '-U', 'postgres'],
      { allowFailure: true, silent: true }
    )

    if (code === 0) {
      console.log('PostgreSQL is ready')
      return
    }

    await sleep(2000)
  }

  console.warn('PostgreSQL readiness check timed out after 30 seconds')
}

async function stop() {
  await runDockerCompose([...composeArgs, 'stop', 'postgres'])
}

async function main() {
  const action = process.argv[2]

  if (action === 'start') {
    await start()
  } else if (action === 'stop') {
    await stop()
  } else {
    console.error('Usage: tsx scripts/manage-db.ts <start|stop>')
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
