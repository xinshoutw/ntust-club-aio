import { useQuery } from '@tanstack/react-query'
import { Card, Flex, Tag, Typography } from 'antd'
import { api } from '../../api/client'

interface HealthData {
  status: string
}

export default function HomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<HealthData>('/health'),
  })

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
      <Card title="臺科大社團管理系統" style={{ width: 360 }}>
        <Flex align="center" justify="space-between">
          <Typography.Text>後端 API</Typography.Text>
          {health.isPending ? (
            <Tag>檢查中</Tag>
          ) : health.isError ? (
            <Tag color="error">離線</Tag>
          ) : (
            <Tag color="success">正常</Tag>
          )}
        </Flex>
      </Card>
    </Flex>
  )
}
