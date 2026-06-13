import { create } from 'zustand'
import type { Task, ClusterNode, MetricsSnapshot, TaskStatus } from '../types'

// Mock data generators
function mockNodes(): ClusterNode[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `node-${i + 1}`,
    name: i === 0 ? 'scheduler-main' : `worker-${i}`,
    type: i === 0 ? 'scheduler' as const : 'worker' as const,
    status: Math.random() > 0.1 ? 'online' as const : 'overloaded' as const,
    cpu: 20 + Math.random() * 60,
    memory: 30 + Math.random() * 50,
    tasks: Math.floor(Math.random() * 8),
    uptime: 3600 + Math.floor(Math.random() * 86400),
  }))
}

function mockLogs(name: string, nodeName: string, status: TaskStatus): string[] {
  const now = Date.now()
  const logs: string[] = [
    `[${new Date(now - 5000).toLocaleTimeString()}] [INFO] Task ${name} initialized`,
    `[${new Date(now - 4800).toLocaleTimeString()}] [INFO] Loading configuration from /etc/scheduler/${name}.yaml`,
    `[${new Date(now - 4500).toLocaleTimeString()}] [INFO] Connecting to database cluster...`,
    `[${new Date(now - 4200).toLocaleTimeString()}] [INFO] Database connection established successfully`,
    `[${new Date(now - 4000).toLocaleTimeString()}] [INFO] Task ${name} started on node ${nodeName}`,
    `[${new Date(now - 3800).toLocaleTimeString()}] [INFO] Processing batch 1 of 5 (records 0-99)`,
    `[${new Date(now - 3500).toLocaleTimeString()}] [DEBUG] Memory usage: 256MB / 1024MB`,
    `[${new Date(now - 3200).toLocaleTimeString()}] [INFO] Processing batch 2 of 5 (records 100-199)`,
  ]

  if (status === 'failed') {
    logs.push(`[${new Date(now - 3000).toLocaleTimeString()}] [WARN] Database query timeout after 30s on table user_transactions`)
    logs.push(`[${new Date(now - 2800).toLocaleTimeString()}] [WARN] Retrying query (attempt 1/3)...`)
    logs.push(`[${new Date(now - 2500).toLocaleTimeString()}] [ERROR] ConnectionError: Lost connection to MySQL server at 'reading initial communication packet', system error: 104`)
    logs.push(`[${new Date(now - 2200).toLocaleTimeString()}] [ERROR] StackTrace: at DatabaseConnector.query(DatabaseConnector.java:142)`)
    logs.push(`[${new Date(now - 2000).toLocaleTimeString()}] [ERROR]   at TaskExecutor.processBatch(TaskExecutor.java:87)`)
    logs.push(`[${new Date(now - 1800).toLocaleTimeString()}] [ERROR]   at TaskExecutor.run(TaskExecutor.java:45)`)
    logs.push(`[${new Date(now - 1500).toLocaleTimeString()}] [FATAL] Task failed after 3 retry attempts`)
    logs.push(`[${new Date(now - 1000).toLocaleTimeString()}] [INFO] Cleaning up temporary resources...`)
    logs.push(`[${new Date(now - 500).toLocaleTimeString()}] [INFO] Task ${name} terminated with status: FAILED`)
  } else if (status === 'success') {
    logs.push(`[${new Date(now - 3000).toLocaleTimeString()}] [INFO] Processing batch 3 of 5 (records 200-299)`)
    logs.push(`[${new Date(now - 2700).toLocaleTimeString()}] [DEBUG] Cache hit ratio: 87%`)
    logs.push(`[${new Date(now - 2400).toLocaleTimeString()}] [INFO] Processing batch 4 of 5 (records 300-399)`)
    logs.push(`[${new Date(now - 2000).toLocaleTimeString()}] [INFO] Processing batch 5 of 5 (records 400-499)`)
    logs.push(`[${new Date(now - 1500).toLocaleTimeString()}] [INFO] All 500 records processed successfully`)
    logs.push(`[${new Date(now - 1000).toLocaleTimeString()}] [INFO] Committing transaction...`)
    logs.push(`[${new Date(now - 500).toLocaleTimeString()}] [INFO] Task ${name} completed successfully`)
  } else if (status === 'running') {
    logs.push(`[${new Date(now - 3000).toLocaleTimeString()}] [INFO] Processing batch 3 of 5 (records 200-299)`)
    logs.push(`[${new Date(now - 2500).toLocaleTimeString()}] [DEBUG] Network latency to upstream: 45ms`)
    logs.push(`[${new Date(now - 2000).toLocaleTimeString()}] [INFO] Processing batch 4 of 5 (records 300-399)`)
    logs.push(`[${new Date(now - 1000).toLocaleTimeString()}] [WARN] Slow response from upstream API: 2500ms`)
    logs.push(`[${new Date(now - 500).toLocaleTimeString()}] [INFO] Still processing... (80% complete)`)
  } else {
    logs.push(`[${new Date(now - 1000).toLocaleTimeString()}] [INFO] Waiting in queue, position: ${Math.floor(Math.random() * 10)}`)
  }

  return logs
}

function mockTasks(nodes: ClusterNode[]): Task[] {
  const names = ['data_sync', 'email_batch', 'report_gen', 'cache_warm', 'log_rotate', 'db_backup', 'index_rebuild', 'health_check']
  return Array.from({ length: 12 }, (_, i) => {
    const status: TaskStatus[] = ['pending', 'running', 'success', 'failed']
    const s = status[Math.floor(Math.random() * 4)]
    const node = nodes[Math.floor(Math.random() * nodes.length)]
    return {
      id: `task-${1000 + i}`,
      name: names[i % names.length],
      status: s,
      node: node.name,
      createdAt: Date.now() - Math.floor(Math.random() * 600000),
      startedAt: s !== 'pending' ? Date.now() - Math.floor(Math.random() * 300000) : undefined,
      completedAt: (s === 'success' || s === 'failed') ? Date.now() - Math.floor(Math.random() * 60000) : undefined,
      retries: s === 'failed' ? Math.floor(Math.random() * 3) : 0,
      maxRetries: 3,
      duration: s === 'success' ? 1000 + Math.floor(Math.random() * 30000) : undefined,
      logs: mockLogs(names[i % names.length], node.name, s),
    }
  })
}

const initialNodes = mockNodes()

interface TaskStore {
  tasks: Task[]
  nodes: ClusterNode[]
  metrics: MetricsSnapshot[]
  selectedTask: Task | null
  addTask: (name: string) => void
  retryTask: (id: string) => void
  cancelTask: (id: string) => void
  selectTask: (t: Task | null) => void
  refreshNodes: () => void
  addMetric: () => void
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: mockTasks(initialNodes),
  nodes: initialNodes,
  metrics: Array.from({ length: 20 }, (_, i) => ({
    time: Date.now() - (20 - i) * 5000,
    totalTasks: 100 + i * 2,
    runningTasks: 3 + Math.floor(Math.random() * 5),
    successRate: 85 + Math.random() * 14,
    avgLatency: 500 + Math.random() * 2000,
    nodeCount: 5,
  })),
  selectedTask: null,
  addTask: (name) => {
    const now = Date.now()
    const task: Task = {
      id: `task-${Date.now()}`,
      name, status: 'pending',
      node: get().nodes[Math.floor(Math.random() * get().nodes.length)].name,
      createdAt: Date.now(), retries: 0, maxRetries: 3,
      logs: [
        `[${new Date(now).toLocaleTimeString()}] [INFO] Task ${name} created by user`,
        `[${new Date(now + 100).toLocaleTimeString()}] [INFO] Task ${name} queued, waiting for available worker`,
      ],
    }
    set({ tasks: [task, ...get().tasks] })
  },
  retryTask: (id) => set({
    tasks: get().tasks.map(t => {
      if (t.id !== id) return t
      const now = Date.now()
      return {
        ...t,
        status: 'pending',
        retries: t.retries + 1,
        logs: [
          ...t.logs,
          `[${new Date(now).toLocaleTimeString()}] [INFO] Retry attempt ${t.retries + 1}/${t.maxRetries} triggered by user`,
          `[${new Date(now + 200).toLocaleTimeString()}] [INFO] Task re-queued for execution`,
        ]
      }
    })
  }),
  cancelTask: (id) => set({
    tasks: get().tasks.map(t => {
      if (t.id !== id) return t
      const now = Date.now()
      return {
        ...t,
        status: 'failed' as TaskStatus,
        logs: [
          ...t.logs,
          `[${new Date(now).toLocaleTimeString()}] [WARN] Task cancellation requested by user`,
          `[${new Date(now + 100).toLocaleTimeString()}] [ERROR] Task aborted: cancelled by operator`,
          `[${new Date(now + 200).toLocaleTimeString()}] [INFO] Task resources released`,
        ]
      }
    })
  }),
  selectTask: (t) => set({ selectedTask: t }),
  refreshNodes: () => set({ nodes: mockNodes() }),
  addMetric: () => {
    const m: MetricsSnapshot = {
      time: Date.now(),
      totalTasks: get().tasks.length,
      runningTasks: get().tasks.filter(t => t.status === 'running').length,
      successRate: (get().tasks.filter(t => t.status === 'success').length / Math.max(get().tasks.length, 1)) * 100,
      avgLatency: 500 + Math.random() * 2000,
      nodeCount: get().nodes.filter(n => n.status !== 'offline').length,
    }
    set({ metrics: [...get().metrics.slice(-30), m] })
  },
}))
