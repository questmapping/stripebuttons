export interface Product {
  id: string;
  name: string;
  price: number; // in euros
  points: number;
}

export const products: Product[] = [
  {
    id: 'prod_20euro',
    name: 'Product 20 Euro',
    price: 20,
    points: 10,
  },
  {
    id: 'prod_35euro',
    name: 'Product 35 Euro',
    price: 35,
    points: 20,
  },
  {
    id: 'prod_50euro',
    name: 'Product 50 Euro',
    price: 50,
    points: 30,
  },
];

export const getProductById = (id: string): Product | undefined => {
  return products.find(p => p.id === id);
};
