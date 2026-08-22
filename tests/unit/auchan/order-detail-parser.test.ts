import { describe, it, expect } from 'vitest';
import { parseOrderDetailPage } from '../../../src/auchan/order-detail-parser.js';

const FULL_HTML = `
<html><body>

<!-- Tracker de statut -->
<ol class="o-orderStatus__list">
  <li class="o-orderStatus__step"><span>Enregistrée</span></li>
  <li class="o-orderStatus__step o-orderStatus__step--active"><span>En cours de préparation</span></li>
  <li class="o-orderStatus__step"><span>Commande disponible</span></li>
  <li class="o-orderStatus__step"><span>Retirée</span></li>
</ol>

<!-- Créneau de retrait -->
<p>Retrait prévu le: mardi 16 juin entre 17h00 et 17h30</p>

<!-- Magasin -->
<div class="m-storeInfo">
  <p class="m-storeInfo__name">Auchan Drive Caluire</p>
  <p class="m-storeInfo__address">10 Chemin Jean Petit 69300 CALUIRE-ET-CUIRE</p>
</div>

<!-- Total -->
<span class="m-orderSummary__totalPrice">38,62 €</span>

<!-- Produits -->
<h2 class="m-orderProductList__categoryTitle">Boucherie, volaille, poissonnerie</h2>

<div class="m-orderProduct">
  <p class="m-orderProduct__name"><strong>AUCHAN</strong> Chipolatas supérieures aux herbes</p>
  <span class="m-orderProduct__quantity">Quantité : 6</span>
  <span class="m-orderProduct__price">8,34 €</span>
</div>

<div class="m-orderProduct">
  <p class="m-orderProduct__name"><strong>MARIE</strong> Quiche lorraine 900g</p>
  <span class="m-orderProduct__quantity">Quantité : 1</span>
  <span class="m-orderProduct__price">5,49 €</span>
</div>

<h2 class="m-orderProductList__categoryTitle">Épicerie salée</h2>

<div class="m-orderProduct">
  <p class="m-orderProduct__name"><strong>PANZANI</strong> Pâtes spaghetti</p>
  <span class="m-orderProduct__quantity">Quantité : 2</span>
  <span class="m-orderProduct__price">2,40 €</span>
</div>

</body></html>
`;

const RETIRED_HTML = `
<html><body>
<ol class="o-orderStatus__list">
  <li class="o-orderStatus__step"><span>Enregistrée</span></li>
  <li class="o-orderStatus__step"><span>En cours de préparation</span></li>
  <li class="o-orderStatus__step"><span>Commande disponible</span></li>
  <li class="o-orderStatus__step o-orderStatus__step--active"><span>Retirée</span></li>
</ol>
<div class="m-storeInfo">
  <p class="m-storeInfo__name">Auchan Drive Caluire</p>
  <p class="m-storeInfo__address">10 Chemin Jean Petit 69300 CALUIRE-ET-CUIRE</p>
</div>
<span class="m-orderSummary__totalPrice">52,10 €</span>
<h2 class="m-orderProductList__categoryTitle">Crèmerie, œufs</h2>
<div class="m-orderProduct">
  <p class="m-orderProduct__name"><strong>AUCHAN</strong> Lait demi-écrémé 6×1l</p>
  <span class="m-orderProduct__quantity">Quantité : 1</span>
  <span class="m-orderProduct__price">4,99 €</span>
</div>
</body></html>
`;

const CURRENT_HTML = `
<html><body>
<span class="a-simplifiedState__label">Retirée</span>
<div class="p-detail__deliveryDate">
  Retrait prévu le: samedi 8 août entre 10h00 et 10h30
</div>
<div class="p-detail__address">
  <strong>Magasin</strong>
  Auchan Drive Ville Test<br>
  12 avenue des Tests<br>
  75000 VILLE TEST
  <a class="p-detail__storeLink" href="/magasin-test">Voir le magasin</a>
</div>
<div class="p-detail__totalAmount">
  <div class="a-amount">91,25 &#x20AC;</div>
</div>

<div class="o-products__category">Fruits et légumes</div>
<div class="o-products__line">
  <p class="product-thumbnail__description">
    <strong>MARQUE TEST</strong> Pommes biologiques 1kg
  </p>
  <div class="p-detail__productQuantity">Quantité : 2</div>
  <div class="a-amount__amount">4,50 &#x20AC;</div>
</div>

<div class="o-products__category">Épicerie</div>
<div class="o-products__line">
  <p class="product-thumbnail__description">
    <strong>EXEMPLE</strong> Riz long 1kg
  </p>
  <div class="p-detail__productQuantity">Quantité : 1</div>
  <div class="a-amount__amount">2,35 &#x20AC;</div>
</div>
</body></html>
`;

describe('parseOrderDetailPage', () => {
  // ── Identifiants ───────────────────────────────────────────────────────────

  it('propage orderRef et orderNumber tels quels', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'AROM-761999631', '370069704');
    expect(d.orderRef).toBe('AROM-761999631');
    expect(d.orderNumber).toBe('370069704');
  });

  // ── Statut ────────────────────────────────────────────────────────────────

  it('extrait le statut courant (étape active)', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.status).toBe('En cours de préparation');
  });

  it('extrait le statut "Retirée" quand c\'est la dernière étape active', () => {
    const d = parseOrderDetailPage(RETIRED_HTML, 'R', '1');
    expect(d.status).toBe('Retirée');
  });

  // ── Créneau de retrait ────────────────────────────────────────────────────

  it('extrait le créneau de retrait', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.pickupSlot).toBe('mardi 16 juin entre 17h00 et 17h30');
  });

  it('pickupSlot est undefined pour une commande déjà retirée', () => {
    const d = parseOrderDetailPage(RETIRED_HTML, 'R', '1');
    expect(d.pickupSlot).toBeUndefined();
  });

  // ── Magasin ────────────────────────────────────────────────────────────────

  it('extrait le nom du magasin', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.storeName).toBe('Auchan Drive Caluire');
  });

  it('extrait l\'adresse du magasin', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.storeAddress).toBe('10 Chemin Jean Petit 69300 CALUIRE-ET-CUIRE');
  });

  // ── Total ─────────────────────────────────────────────────────────────────

  it('parse le total en centimes', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.total).toBe(3862);
  });

  it('conserve le total formaté', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.totalFormatted).toBe('38,62 €');
  });

  // ── Produits ──────────────────────────────────────────────────────────────

  it('retourne 3 produits au total', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.products).toHaveLength(3);
  });

  it('extrait le nom du premier produit sans la marque', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.products[0].name).toBe('Chipolatas supérieures aux herbes');
  });

  it('extrait la marque du premier produit', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.products[0].brand).toBe('AUCHAN');
  });

  it('extrait la quantité', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.products[0].quantity).toBe(6);
    expect(d.products[1].quantity).toBe(1);
  });

  it('parse le prix en centimes', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.products[0].price).toBe(834);
  });

  it('conserve le prix formaté', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.products[0].priceFormatted).toBe('8,34 €');
  });

  // ── Catégories ────────────────────────────────────────────────────────────

  it('associe les produits à la bonne catégorie', () => {
    const d = parseOrderDetailPage(FULL_HTML, 'R', '1');
    expect(d.products[0].category).toBe('Boucherie, volaille, poissonnerie');
    expect(d.products[1].category).toBe('Boucherie, volaille, poissonnerie');
    expect(d.products[2].category).toBe('Épicerie salée');
  });

  // ── Page vide ─────────────────────────────────────────────────────────────

  it('retourne un OrderDetail vide sur page sans produit', () => {
    const d = parseOrderDetailPage('<html><body></body></html>', 'REF', '000');
    expect(d.products).toEqual([]);
    expect(d.storeName).toBe('');
    expect(d.total).toBe(0);
  });

  // ── Structure Auchan actuelle (2026) ────────────────────────────────────

  it('parse la structure de détail actuelle sans perdre les anciens formats', () => {
    const d = parseOrderDetailPage(CURRENT_HTML, 'AROM-TEST', '100000001');

    expect(d.status).toBe('Retirée');
    expect(d.pickupSlot).toBe('samedi 8 août entre 10h00 et 10h30');
    expect(d.storeName).toBe('Auchan Drive Ville Test');
    expect(d.storeAddress).toBe('12 avenue des Tests, 75000 VILLE TEST');
    expect(d.total).toBe(9125);
    expect(d.totalFormatted).toBe('91,25 €');
    expect(d.products).toHaveLength(2);
    expect(d.products[0]).toEqual({
      name: 'Pommes biologiques 1kg',
      brand: 'MARQUE TEST',
      quantity: 2,
      price: 450,
      priceFormatted: '4,50 €',
      category: 'Fruits et légumes',
    });
    expect(d.products[1].category).toBe('Épicerie');
  });

  it('complète une page hybride avec les champs du format historique', () => {
    const hybrid = CURRENT_HTML.replace(
      '<div class="p-detail__address">',
      '<div class="m-storeInfo"><p class="m-storeInfo__name">Magasin historique</p>' +
        '<p class="m-storeInfo__address">1 rue Historique</p></div>' +
        '<div class="p-detail__address-inconnue">',
    );
    const d = parseOrderDetailPage(hybrid, 'R', '1');

    expect(d.storeName).toBe('Magasin historique');
    expect(d.storeAddress).toBe('1 rue Historique');
    expect(d.totalFormatted).toBe('91,25 €');
    expect(d.products).toHaveLength(2);
  });
});
