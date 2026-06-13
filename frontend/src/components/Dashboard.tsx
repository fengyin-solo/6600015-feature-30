import { useState, useMemo, useRef, useEffect } from 'react'
import { Layout, Tabs, Statistic, Row, Col, Card, Tag, Button, Input, Table, Drawer, Descriptions, Space, Progress, Tooltip } from 'antd'
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { useTaskStore } from '../store/tasks'
import type { Task, TaskStatus } from '../types'

const { Header, Content } = Layout

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'default', running: 'processing', success: 'success', failed: 'error', retry: 'warning'
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  INFO: '#61afef',
  WARN: '#e5c07b',
  ERROR: '#e06c75',
  FATAL: '#ff4d4f',
  DEBUG: '#98c379',
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getLogLevel(line: string): string {
  const match = line.match(/\[(INFO|WARN|ERROR|FATAL|DEBUG)\]/)
  return match ? match[1] : 'INFO'
}

function highlightText(text: string, keyword: string): React.ReactNode[] {
  if (!keyword.trim()) return [text]
  const kw = keyword.trim()
  const regex = new RegExp(`(${escapeRegExp(kw)})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    part.toLowerCase() === kw.toLowerCase() ? (
      <span key={i} style={{ background: '#ffd666', color: '#000', padding: '0 2px', borderRadius: 2 }}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export default function Dashboard() {
  const store = useTaskStore()
  const [newTaskName, setNewTaskName] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [currentErrorIndex, setCurrentErrorIndex] = useState(0)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const logContainerRef = useRef<HTMLPreElement>(null)
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const taskColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 100 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: TaskStatus) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
    { title: '节点', dataIndex: 'node', key: 'node' },
    { title: '重试', key: 'retries', render: (_: any, r: Task) => `${r.retries}/${r.maxRetries}` },
    { title: '耗时', key: 'duration', render: (_: any, r: Task) => r.duration ? `${(r.duration / 1000).toFixed(1)}s` : '-' },
    { title: '操作', key: 'actions', render: (_: any, r: Task) => (
      <Space>
        {r.status === 'failed' && <Button size="small" type="primary" onClick={() => store.retryTask(r.id)}>重试</Button>}
        {r.status === 'running' && <Button size="small" danger onClick={() => store.cancelTask(r.id)}>取消</Button>}
        <Button size="small" onClick={() => { store.selectTask(r); setDrawerOpen(true); setSearchKeyword(''); setCurrentErrorIndex(0); setCurrentMatchIndex(0) }}>详情</Button>
      </Space>
    )},
  ]

  const successCount = store.tasks.filter(t => t.status === 'success').length
  const failedCount = store.tasks.filter(t => t.status === 'failed').length
  const runningCount = store.tasks.filter(t => t.status === 'running').length

  const errorLineIndices = useMemo(() => {
    if (!store.selectedTask) return []
    return store.selectedTask.logs
      .map((line, idx) => {
        const level = getLogLevel(line)
        return (level === 'ERROR' || level === 'FATAL') ? idx : -1
      })
      .filter(idx => idx !== -1)
  }, [store.selectedTask])

  const warningLineIndices = useMemo(() => {
    if (!store.selectedTask) return []
    return store.selectedTask.logs
      .map((line, idx) => getLogLevel(line) === 'WARN' ? idx : -1)
      .filter(idx => idx !== -1)
  }, [store.selectedTask])

  const matchedLineIndices = useMemo(() => {
    if (!store.selectedTask || !searchKeyword.trim()) return []
    const kw = searchKeyword.trim().toLowerCase()
    return store.selectedTask.logs
      .map((line, idx) => line.toLowerCase().includes(kw) ? idx : -1)
      .filter(idx => idx !== -1)
  }, [store.selectedTask, searchKeyword])

  const scrollToLineByGlobalIndex = (globalLineIndex: number) => {
    const container = logContainerRef.current
    const lineEl = lineRefs.current.get(globalLineIndex)
    if (!container || !lineEl) return
    const containerHeight = container.clientHeight
    const lineTop = lineEl.offsetTop
    const lineHeight = lineEl.offsetHeight
    const targetScrollTop = lineTop - containerHeight / 2 + lineHeight / 2
    container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' })
  }

  const goToPrevError = () => {
    if (errorLineIndices.length === 0) return
    setCurrentErrorIndex(prev => prev === 0 ? errorLineIndices.length - 1 : prev - 1)
  }

  const goToNextError = () => {
    if (errorLineIndices.length === 0) return
    setCurrentErrorIndex(prev => prev === errorLineIndices.length - 1 ? 0 : prev + 1)
  }

  const goToFirstError = () => {
    if (errorLineIndices.length === 0) return
    setCurrentErrorIndex(0)
  }

  const goToPrevMatch = () => {
    if (matchedLineIndices.length === 0) return
    setCurrentMatchIndex(prev => prev === 0 ? matchedLineIndices.length - 1 : prev - 1)
  }

  const goToNextMatch = () => {
    if (matchedLineIndices.length === 0) return
    setCurrentMatchIndex(prev => prev === matchedLineIndices.length - 1 ? 0 : prev + 1)
  }

  const goToFirstMatch = () => {
    if (matchedLineIndices.length === 0) return
    setCurrentMatchIndex(0)
  }

  useEffect(() => {
    lineRefs.current.clear()
  }, [store.selectedTask])

  useEffect(() => {
    if (searchKeyword.trim()) {
      if (currentMatchIndex >= matchedLineIndices.length) {
        setCurrentMatchIndex(0)
      }
    } else {
      setCurrentMatchIndex(0)
    }
  }, [searchKeyword, matchedLineIndices.length])

  useEffect(() => {
    if (currentErrorIndex >= errorLineIndices.length && errorLineIndices.length > 0) {
      setCurrentErrorIndex(0)
    }
  }, [errorLineIndices.length])

  useEffect(() => {
    if (drawerOpen && errorLineIndices.length > 0) {
      const timer = setTimeout(() => {
        scrollToLineByGlobalIndex(errorLineIndices[0])
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [drawerOpen])

  useEffect(() => {
    if (errorLineIndices.length === 0) return
    const targetLine = errorLineIndices[currentErrorIndex]
    if (targetLine === undefined) return
    const timer = setTimeout(() => {
      scrollToLineByGlobalIndex(targetLine)
    }, 50)
    return () => clearTimeout(timer)
  }, [currentErrorIndex, errorLineIndices])

  useEffect(() => {
    if (matchedLineIndices.length === 0 || !searchKeyword.trim()) return
    const targetLine = matchedLineIndices[currentMatchIndex]
    if (targetLine === undefined) return
    const timer = setTimeout(() => {
      scrollToLineByGlobalIndex(targetLine)
    }, 50)
    return () => clearTimeout(timer)
  }, [currentMatchIndex, matchedLineIndices, searchKeyword])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <h1 style={{ color: 'white', margin: 0, fontSize: 18 }}>🔧 分布式任务调度与监控平台</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Input placeholder="任务名称" value={newTaskName} onChange={e => setNewTaskName(e.target.value)} style={{ width: 160 }} />
          <Button type="primary" onClick={() => { if (newTaskName) { store.addTask(newTaskName); setNewTaskName('') } }}>
            添加任务
          </Button>
        </div>
      </Header>
      <Content style={{ padding: 16 }}>
        {/* Stats */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card><Statistic title="总任务" value={store.tasks.length} /></Card></Col>
          <Col span={6}><Card><Statistic title="运行中" value={runningCount} valueStyle={{ color: '#1890ff' }} /></Card></Col>
          <Col span={6}><Card><Statistic title="成功" value={successCount} valueStyle={{ color: '#52c41a' }} /></Card></Col>
          <Col span={6}><Card><Statistic title="失败" value={failedCount} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        </Row>

        <Tabs items={[
          { key: 'metrics', label: '监控指标', children: (
            <Row gutter={16}>
              <Col span={12}>
                <Card title="运行中任务数">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={store.metrics}>
                      <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleTimeString()} fontSize={10} />
                      <YAxis fontSize={10} />
                      <RechartsTooltip labelFormatter={t => new Date(t as number).toLocaleString()} />
                      <Area type="monotone" dataKey="runningTasks" stroke="#1890ff" fill="#1890ff" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col span={12}>
                <Card title="成功率 %">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={store.metrics}>
                      <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleTimeString()} fontSize={10} />
                      <YAxis domain={[0, 100]} fontSize={10} />
                      <RechartsTooltip labelFormatter={t => new Date(t as number).toLocaleString()} />
                      <Line type="monotone" dataKey="successRate" stroke="#52c41a" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col span={24} style={{ marginTop: 16 }}>
                <Card title="平均延迟 (ms)">
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={store.metrics}>
                      <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleTimeString()} fontSize={10} />
                      <YAxis fontSize={10} />
                      <RechartsTooltip />
                      <Area type="monotone" dataKey="avgLatency" stroke="#faad14" fill="#faad14" fillOpacity={0.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            </Row>
          )},
          { key: 'tasks', label: '任务列表', children: (
            <Table dataSource={store.tasks} columns={taskColumns} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
          )},
          { key: 'nodes', label: '集群节点', children: (
            <Row gutter={16}>
              {store.nodes.map(node => (
                <Col span={8} key={node.id} style={{ marginBottom: 16 }}>
                  <Card title={<span>{node.type === 'scheduler' ? '🎯' : '⚙️'} {node.name}</span>}
                    extra={<Tag color={node.status === 'online' ? 'green' : node.status === 'overloaded' ? 'orange' : 'red'}>{node.status}</Tag>}>
                    <Progress percent={Math.round(node.cpu)} strokeColor={node.cpu > 80 ? '#ff4d4f' : '#1890ff'} format={v => `CPU ${v}%`} />
                    <Progress percent={Math.round(node.memory)} strokeColor={node.memory > 80 ? '#ff4d4f' : '#52c41a'} format={v => `MEM ${v}%`} />
                    <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                      任务数: {node.tasks} | 运行时间: {Math.floor(node.uptime / 3600)}h
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          )},
        ]} />

        {/* Task Detail Drawer */}
        <Drawer title="任务详情" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={720}>
          {store.selectedTask && (
            <>
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label="ID">{store.selectedTask.id}</Descriptions.Item>
                <Descriptions.Item label="名称">{store.selectedTask.name}</Descriptions.Item>
                <Descriptions.Item label="状态"><Tag color={STATUS_COLORS[store.selectedTask.status]}>{store.selectedTask.status}</Tag></Descriptions.Item>
                <Descriptions.Item label="执行节点">{store.selectedTask.node}</Descriptions.Item>
                <Descriptions.Item label="重试次数">{store.selectedTask.retries}/{store.selectedTask.maxRetries}</Descriptions.Item>
                <Descriptions.Item label="耗时">{store.selectedTask.duration ? `${(store.selectedTask.duration / 1000).toFixed(1)}s` : '-'}</Descriptions.Item>
                <Descriptions.Item label="创建时间" span={2}>{new Date(store.selectedTask.createdAt).toLocaleString()}</Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 16, marginBottom: 8 }}>
                <Space style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0 }}>执行日志</h4>
                  <Space size="small">
                    <Tag color="error">错误: {errorLineIndices.length}</Tag>
                    <Tag color="warning">警告: {warningLineIndices.length}</Tag>
                    {searchKeyword.trim() && <Tag color="processing">匹配: {matchedLineIndices.length}</Tag>}
                  </Space>
                </Space>

                <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
                  <Input
                    placeholder="搜索关键词，支持高亮显示..."
                    value={searchKeyword}
                    onChange={e => {
                      setSearchKeyword(e.target.value)
                      setCurrentErrorIndex(0)
                      setCurrentMatchIndex(0)
                    }}
                    onClear={() => {
                      setSearchKeyword('')
                      setCurrentMatchIndex(0)
                    }}
                    allowClear
                    prefix={<span>🔍</span>}
                  />
                  {searchKeyword.trim() && (
                    <>
                      <Tooltip title="跳转到第一个匹配">
                        <Button icon="⏮" onClick={goToFirstMatch} disabled={matchedLineIndices.length === 0} />
                      </Tooltip>
                      <Tooltip title="上一个匹配">
                        <Button icon="⬆" onClick={goToPrevMatch} disabled={matchedLineIndices.length === 0} />
                      </Tooltip>
                      <Tooltip title="下一个匹配">
                        <Button icon="⬇" onClick={goToNextMatch} disabled={matchedLineIndices.length === 0} />
                      </Tooltip>
                    </>
                  )}
                  <Tooltip title="跳转到第一个错误">
                    <Button icon="⏮" onClick={goToFirstError} disabled={errorLineIndices.length === 0} />
                  </Tooltip>
                  <Tooltip title="上一个错误">
                    <Button icon="⬆" onClick={goToPrevError} disabled={errorLineIndices.length === 0} />
                  </Tooltip>
                  <Tooltip title="下一个错误">
                    <Button icon="⬇" onClick={goToNextError} disabled={errorLineIndices.length === 0} />
                  </Tooltip>
                </Space.Compact>

                {(errorLineIndices.length > 0 || matchedLineIndices.length > 0) && (
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                    {errorLineIndices.length > 0 && (
                      <>
                        当前错误: {currentErrorIndex + 1} / {errorLineIndices.length} &nbsp;|&nbsp;
                        <a onClick={goToFirstError} style={{ cursor: 'pointer' }}>跳转到首个错误</a>
                      </>
                    )}
                    {matchedLineIndices.length > 0 && searchKeyword.trim() && (
                      <>
                        {errorLineIndices.length > 0 && <>&nbsp;&nbsp;</>}
                        当前匹配: {currentMatchIndex + 1} / {matchedLineIndices.length} &nbsp;|&nbsp;
                        <a onClick={goToFirstMatch} style={{ cursor: 'pointer' }}>跳转到首个匹配</a>
                      </>
                    )}
                  </div>
                )}
              </div>

              <pre
                ref={logContainerRef}
                style={{
                  background: '#1f1f1f',
                  padding: 0,
                  borderRadius: 8,
                  fontSize: 12,
                  maxHeight: 450,
                  overflow: 'auto',
                  margin: 0,
                  fontFamily: '"SF Mono", Monaco, Menlo, Consolas, monospace',
                }}
              >
                {store.selectedTask.logs.map((line, idx) => {
                  const level = getLogLevel(line)
                  const color = LOG_LEVEL_COLORS[level] || '#abb2bf'
                  const isError = level === 'ERROR' || level === 'FATAL'
                  const isWarning = level === 'WARN'
                  const errorPos = errorLineIndices.indexOf(idx)
                  const isCurrentError = errorPos !== -1 && currentErrorIndex === errorPos
                  const isMatched = !!searchKeyword.trim() && line.toLowerCase().includes(searchKeyword.trim().toLowerCase())
                  const matchPos = isMatched ? matchedLineIndices.indexOf(idx) : -1
                  const isCurrentMatch = matchPos !== -1 && currentMatchIndex === matchPos

                  return (
                    <div
                      key={idx}
                      ref={(el) => {
                        if (el) {
                          lineRefs.current.set(idx, el)
                        } else {
                          lineRefs.current.delete(idx)
                        }
                      }}
                      style={{
                        padding: '2px 12px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        background: isCurrentMatch
                          ? 'rgba(255, 214, 102, 0.35)'
                          : isCurrentError
                          ? 'rgba(255, 77, 79, 0.25)'
                          : isMatched
                          ? 'rgba(255, 214, 102, 0.15)'
                          : isError
                          ? 'rgba(255, 77, 79, 0.08)'
                          : isWarning
                          ? 'rgba(229, 192, 123, 0.06)'
                          : 'transparent',
                        borderLeft: isCurrentMatch
                          ? '3px solid #faad14'
                          : isCurrentError
                          ? '3px solid #ff4d4f'
                          : isError
                          ? '3px solid rgba(255,77,79,0.4)'
                          : isWarning
                          ? '3px solid rgba(229,192,123,0.4)'
                          : '3px solid transparent',
                      }}
                    >
                      <span style={{ color: '#5c6370', userSelect: 'none', minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
                        {idx + 1}
                      </span>
                      <span style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1 }}>
                        {highlightText(line, searchKeyword)}
                      </span>
                    </div>
                  )
                })}
              </pre>
            </>
          )}
        </Drawer>
      </Content>
    </Layout>
  )
}
