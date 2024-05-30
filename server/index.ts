#!/usr/bin/env node

import { Server } from '@hocuspocus/server'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import * as path from 'path'
import { SQLiteWithFS } from './persistence.js'
import { startBuilder } from './builder.js'
import { RedisClientType, createClient } from 'redis'
import sqlite3 from 'sqlite3'
import { readFile } from 'fs/promises'
import * as fastifyStatic from '@fastify/static'

/**
 * Build workflow:
 *
 * - Client requests build
 * - All trees that have been marked dirty are saved
 * - Forester command run
 * - Build result saved in database
 * - Preview results updated asynchronously
 *
 * Preview workflow:
 *
 * - Subscribe to previews for a tree
 * - Check if there has been a build
 *   - If not: do build
 *
 * - Any client subscribed to previews for a tree gets
 *   messages when that tree updates after a build.
 */

const _client = createClient()

async function newClient(): Promise<RedisClientType> {
  return await _client
      .duplicate()
      .on('error', err => console.error(err))
      .connect() as RedisClientType
}

const fastifyClient = await newClient()

const app = Fastify({ logger: true })

const forestDir = process.env.FOREST_DIR || '/tmp/forest'
const builtRoot = path.join(forestDir, 'output')
const contentRoot = path.join(forestDir, 'trees')
const dbPath = 'state.db'
const db = new sqlite3.Database(dbPath)

app.register(fastifyStatic, {
  root: builtRoot,
  prefix: '/built'
})


await app.register(websocket) //vscode is being stupid

const persistence = new SQLiteWithFS(db, contentRoot)
//change

const hocuspocus = Server.configure({
  async onConnect() {
    console.log('🔮')
  },

  extensions: [persistence],
})

startBuilder(
  hocuspocus,
  db,
  await newClient(),
  await newClient(),
  forestDir,
  contentRoot
)

app.get('/collaboration', { websocket: true }, (socket, req) => {
  hocuspocus.handleConnection(socket, req as any, {});
})


app.get('/preview/:tree', { websocket: true }, async (socket, req) => {
  const subscriber = await newClient()
  const getter = await newClient()
  const tree: string = (req.params as any).tree

  function sendBuilding() {
    socket.send(JSON.stringify({ state: 'building' }))
  }

  async function sendBuild(first: boolean) {
    const last_build_result = await getter.get('last_build_result')
    if (last_build_result != null) {
      const res = JSON.parse(last_build_result)
      if (res.success) {
        const content = await readFile(
          path.join(builtRoot, tree + '.xml'),
          { encoding: 'utf8' }
        )
        socket.send(JSON.stringify({
          state: 'finished',
          result: { success: true, content }
        }))
      } else {
        socket.send(JSON.stringify({
          state: 'finished',
          result: res
        }))
      }
    } else if (first) {
      sendBuilding()
    }
  }

  await sendBuild(true)

  await subscriber.subscribe('build_notifications', async (message, _channel) => {
    if (message == 'building') {
      sendBuilding()
    } else if (message == 'finished') {
      sendBuild(false)
    }
  })

  socket.on('close', () => subscriber.unsubscribe('build_notifications'))
})

app.post('/api/build', async (_req) => {
  fastifyClient.publish('build_requests', '')
})

app.listen({ port: 1234 })
