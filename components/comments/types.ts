export interface User {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

export interface Comment {
  id: string
  documentId: string
  authorId: string
  content: string
  quote: string | null
  resolved: boolean
  createdAt: string
  updatedAt: string
  parentId: string | null
  author: User
  replies?: Comment[]
}
