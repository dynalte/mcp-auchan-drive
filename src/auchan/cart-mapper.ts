/**
 * cart-mapper.ts — Mappe la réponse JSON de GET /cart → Cart
 * Les montants dans l'API sont en centimes (amount: 4354 = 43,54 €).
 */

import type { Cart, CartItem } from '../types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RawPrice {
  amount?: number;
  currency?: string;
}

interface RawOffering {
  prices?: {
    price?: RawPrice;
    totalPrice?: RawPrice;
  };
}

interface RawItem {
  id?: string;
  productId?: string;
  offerId?: string;
  desiredQuantity?: number;
  offering?: RawOffering;
}

interface RawProduct {
  name?: string;
  brand?: {
    name?: string;
  };
}

interface RawEnrichedItem {
  productId?: string;
  cartItem?: RawItem;
  product?: RawProduct;
}

interface RawCartInner {
  id?: string;
  prices?: {
    totalPrice?: RawPrice;
  };
  items?: RawItem[];
}

interface RawCartContainer {
  cart?: RawCartInner;

  /**
   * Vue enrichie renvoyée par GET /cart.
   * Elle contient notamment product.name, absent de cart.cart.items.
   */
  items?: RawEnrichedItem[];
}

interface RawCartResponse {
  cart?: RawCartContainer;
}

function amount(price: RawPrice | undefined): number {
  return price?.amount ?? 0;
}

/**
 * Construit l'index des libellés depuis la vue enrichie cart.items.
 */
function extractProductLabels(
  items: RawEnrichedItem[] | undefined,
): Map<string, string> {
  const labels = new Map<string, string>();

  for (const item of items ?? []) {
    const productId =
      item.productId ??
      item.cartItem?.productId ??
      '';

    const label = item.product?.name?.trim() ?? '';

    if (productId && label) {
      labels.set(productId, label);
    }
  }

  return labels;
}

/**
 * Mappe la réponse brute de GET /cart vers le type Cart.
 *
 * cart.cart.items fournit les lignes opérationnelles :
 * quantités, prix et identifiants.
 *
 * cart.items fournit les informations produit enrichies :
 * nom, marque, images, etc.
 *
 * Les deux vues sont fusionnées par productId.
 */
export function mapCart(raw: unknown): Cart {
  const data = raw as RawCartResponse;
  const container = data?.cart ?? {};
  const inner = container.cart ?? {};

  const labels = extractProductLabels(container.items);

  const items: CartItem[] = (inner.items ?? []).map(
    (item): CartItem => {
      const productId = item.productId ?? '';

      return {
        productId,
        label: labels.get(productId) ?? '',
        quantity: item.desiredQuantity ?? 0,
        unitPrice: amount(item.offering?.prices?.price),
        totalPrice: amount(item.offering?.prices?.totalPrice),
      };
    },
  );

  return {
    items,
    total: amount(inner.prices?.totalPrice),
    itemCount: items.length,
  };
}

/**
 * Extrait le cartId depuis la réponse brute.
 * Nécessaire pour les mutations POST /cart/update.
 */
export function extractCartId(raw: unknown): string | undefined {
  const data = raw as RawCartResponse;
  return data?.cart?.cart?.id;
}
