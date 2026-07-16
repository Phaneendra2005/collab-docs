'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Document {
  id: string
  title: string
  updatedAt: string
}

export function Dashboard() {
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('updatedAt')
  const [cursor, setCursor] = useState<string | undefined>(undefined)

  const { data, isLoading } = useQuery({
    queryKey: ['documents', debouncedSearch, filter, sort, cursor],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedSearch,
        filter,
        sort,
        limit: '20',
      })
      if (cursor) params.append('cursor', cursor)
      const res = await fetch(`/api/documents?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json() as Promise<{ data: Document[]; meta: { nextCursor: string | null } }>
    },
  })

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Documents</h1>
        <Button onClick={() => alert('Open Create Modal')}>Create Document</Button>
      </div>

      <div className="flex space-x-4 items-center">
        <Input
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="p-2 border rounded"
        >
          <option value="all">Recent</option>
          <option value="owner">Owned</option>
          <option value="shared">Shared</option>
          <option value="favorite">Favorites</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="p-2 border rounded"
        >
          <option value="updatedAt">Last Updated</option>
          <option value="createdAt">Date Created</option>
          <option value="title">Title</option>
        </select>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {data?.data.map((doc) => (
            <Card key={doc.id} className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle>{doc.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  Updated: {new Date(doc.updatedAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data?.meta?.nextCursor && (
        <div className="flex justify-center mt-6">
          <Button variant="outline" onClick={() => setCursor(data.meta.nextCursor!)}>
            Load More
          </Button>
        </div>
      )}
    </div>
  )
}
