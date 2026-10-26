export type Item = {
  id: string
  name: string
  category: string
  quantity: number
  unit: string
  min_quantity: number
  location: string
  updated_at: string
}

export type ItemInput = Omit<Item, 'id' | 'updated_at'>
