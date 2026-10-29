-- Starter catalogue + settings for Shoukhin.
-- Replace the demo products with real inventory from the dashboard once live.
-- Apply with: npx wrangler d1 execute shoukhin-db --remote --file=migrations/0002_seed.sql

-- ---------------------------------------------------------------- categories
INSERT OR REPLACE INTO categories (id, name, name_bn, slug, parent_id, image, sort_order) VALUES
  ('cat-three-piece','Three Piece','তিন পিস','three-piece',NULL,'/assets/categories/three-piece.webp',1),
  ('cat-kurti','Kurti','কুর্তি','kurti',NULL,'/assets/categories/kurti.webp',2),
  ('cat-saree','Saree','শাড়ি','saree',NULL,'/assets/categories/saree.webp',3),
  ('cat-coord','Co-Ord Set','কো-অর্ড সেট','co-ord-set',NULL,'/assets/categories/co-ord-set.webp',4),
  ('cat-kaftan','Kaftan','কাফতান','kaftan',NULL,'/assets/categories/kaftan.webp',5),
  ('cat-gown','Gown','গাউন','gown',NULL,'/assets/categories/gown.webp',6),
  ('cat-dupatta','Dupatta & Orna','ওড়না','dupatta-orna',NULL,'/assets/categories/dupatta-orna.webp',7),
  ('cat-winter','Winter Collection','শীতের পোশাক','winter-collection',NULL,'/assets/categories/winter-collection.webp',8);

INSERT OR REPLACE INTO categories (id, name, name_bn, slug, parent_id, sort_order) VALUES
  ('cat-tp-cotton','Cotton Three Piece',NULL,'cotton-three-piece','cat-three-piece',1),
  ('cat-tp-premium','Premium Three Piece',NULL,'premium-three-piece','cat-three-piece',2),
  ('cat-tp-unstitched','Unstitched',NULL,'unstitched-three-piece','cat-three-piece',3),
  ('cat-sr-jamdani','Jamdani',NULL,'jamdani-saree','cat-saree',1),
  ('cat-sr-cotton','Cotton Saree',NULL,'cotton-saree','cat-saree',2),
  ('cat-sr-halfsilk','Half Silk',NULL,'half-silk-saree','cat-saree',3);

-- ------------------------------------------------------------------ products
-- sizes/colors/images are JSON. Prices in BDT.
INSERT OR REPLACE INTO products
 (id,title,slug,sku,short_description,description,category_id,price,discount_price,stock,sizes,colors,images,fabric,care,tag,is_featured,is_flash_sale,flash_sale_ends_at,sort_order) VALUES

('p-rose-azure','Rose & Azure Cotton Set','rose-azure-cotton-set','SHK-TP-001',
 'Soft handloom cotton three piece with contrast dupatta.',
 'A breathable everyday three piece cut from soft handloom cotton. The kameez carries a fine block-printed yoke, paired with a straight salwar and a contrast azure dupatta. Made for Dhaka heat and long days.',
 'cat-tp-cotton',1850,1550,12,'["36","38","40","42","44"]','[{"name":"Rose","hex":"#cd799b"},{"name":"Azure","hex":"#5b7fa6"}]','["/assets/products/p01.webp","/assets/products/p02.webp"]',
 '100% Handloom Cotton','Hand wash in cold water. Dry in shade. Warm iron.','Best Seller',1,1,'2026-11-06T18:00:00Z',1),

('p-maroon-heritage','Maroon Heritage Three Piece','maroon-heritage-three-piece','SHK-TP-002',
 'Deep wine kameez with hand embroidery at the neckline.',
 'Our signature wine tone, finished with hand embroidery across the neckline and sleeve cuffs. Comes as kameez, salwar and a matching chiffon dupatta.',
 'cat-tp-premium',3200,2690,8,'["36","38","40","42"]','[{"name":"Wine","hex":"#682636"}]','["/assets/products/p03.webp","/assets/products/p04.webp"]',
 'Premium Cotton with Chiffon Dupatta','Dry clean recommended for first wash.','New',1,1,'2026-11-06T18:00:00Z',2),

('p-noor-gul','Noor-e-Gul Ethnic Suit','noor-e-gul-ethnic-suit','SHK-TP-003',
 'Floral Jaipuri print, full three piece set.',
 'A Jaipuri floral print on fine cotton, cut generously for comfort. Includes kameez, salwar and dupatta.',
 'cat-tp-cotton',1680,1290,15,'["36","38","40","42","44","46"]','[{"name":"Blush","hex":"#e0bdc6"},{"name":"Ivory","hex":"#fff8ef"}]','["/assets/products/p02.webp","/assets/products/p01.webp"]',
 '100% Pure Cotton','Machine wash cold, gentle cycle.','',0,1,'2026-11-06T18:00:00Z',3),

('p-lucknow-chikan','Lucknow Chikankari Three Piece','lucknow-chikankari-three-piece','SHK-TP-004',
 'Fine white-on-white chikankari hand work.',
 'Classic chikankari hand embroidery on a soft georgette base. Understated, and the one piece that works for both office and dawat.',
 'cat-tp-premium',4200,3650,5,'["38","40","42"]','[{"name":"Ivory","hex":"#fff8ef"}]','["/assets/products/p06.webp","/assets/products/p07.webp"]',
 'Georgette with Cotton Lining','Dry clean only.','Premium',1,0,NULL,4),

('p-unstitched-deshi','Deshi Unstitched Three Piece','deshi-unstitched-three-piece','SHK-TP-005',
 'Unstitched fabric set, tailor it your way.',
 'Three uncut pieces, kameez, salwar and dupatta, so your own tailor can cut it to your fit. Popular before Eid.',
 'cat-tp-unstitched',1450,1150,22,'["Unstitched"]','[{"name":"Teal","hex":"#2f6f6a"},{"name":"Wine","hex":"#682636"}]','["/assets/products/p04.webp","/assets/products/p03.webp"]',
 'Cotton Lawn','Wash separately before stitching.','',0,1,'2026-11-06T18:00:00Z',5),

('p-gulabi-kurti','Gulabi Noor Kurti','gulabi-noor-kurti','SHK-KU-001',
 'Straight-cut kurti with side slits.',
 'A straight-cut kurti in soft rose, with side slits and a mandarin collar. Wear it with churidar or jeans.',
 'cat-kurti',1250,950,18,'["S","M","L","XL","XXL"]','[{"name":"Rose","hex":"#cd799b"}]','["/assets/products/p06.webp","/assets/products/p05.webp"]',
 'Viscose Cotton','Machine wash cold.','Best Seller',1,1,'2026-11-06T18:00:00Z',6),

('p-embroidered-kurti','Embroidered A-Line Kurti','embroidered-a-line-kurti','SHK-KU-002',
 'A-line cut with thread embroidery on the placket.',
 'An A-line kurti with tonal thread embroidery down the placket. Full sleeves with button cuffs.',
 'cat-kurti',1590,1290,14,'["S","M","L","XL"]','[{"name":"Wine","hex":"#682636"},{"name":"Olive","hex":"#6b7355"}]','["/assets/products/p07.webp","/assets/products/p08.webp"]',
 'Rayon','Hand wash preferred.','',0,0,NULL,7),

('p-short-tops','Everyday Short Top','everyday-short-top','SHK-KU-003',
 'Light cotton short top for daily wear.',
 'A short cotton top that holds its shape through the week. Simple, light, and easy to layer.',
 'cat-kurti',1250,890,26,'["S","M","L","XL"]','[{"name":"Ivory","hex":"#fff8ef"},{"name":"Black","hex":"#282125"}]','["/assets/products/p08.webp","/assets/products/p05.webp"]',
 'Cotton Slub','Machine wash cold.','',0,1,'2026-11-06T18:00:00Z',8),

('p-jamdani-classic','Classic Jamdani Saree','classic-jamdani-saree','SHK-SR-001',
 'Handwoven Jamdani with geometric motifs.',
 'Woven on a traditional handloom, this Jamdani carries fine geometric motifs across the body and a denser pallu. Comes without blouse piece.',
 'cat-sr-jamdani',6500,5800,4,'["Free Size"]','[{"name":"Off White","hex":"#f4eeeb"},{"name":"Wine","hex":"#682636"}]','["/assets/products/p10.webp","/assets/products/p11.webp"]',
 'Handwoven Cotton Jamdani','Dry clean only. Store folded in muslin.','Handloom',1,0,NULL,9),

('p-tangail-cotton-saree','Tangail Cotton Saree','tangail-cotton-saree','SHK-SR-002',
 'Everyday Tangail cotton with a woven border.',
 'A light Tangail cotton saree with a woven contrast border. The one you reach for on a working morning.',
 'cat-sr-cotton',2400,1950,11,'["Free Size"]','[{"name":"Sky","hex":"#9bb7cc"},{"name":"Rose","hex":"#cd799b"}]','["/assets/products/p09.webp","/assets/products/p12.webp"]',
 'Tangail Cotton','Hand wash separately.','',0,0,NULL,10),

('p-half-silk-saree','Half Silk Katan Saree','half-silk-katan-saree','SHK-SR-003',
 'Half silk with a zari-worked pallu.',
 'Half silk katan with a zari-worked pallu, cut for weddings and occasions where you want some shine.',
 'cat-sr-halfsilk',5200,4400,6,'["Free Size"]','[{"name":"Wine","hex":"#682636"},{"name":"Emerald","hex":"#417553"}]','["/assets/products/p12.webp","/assets/products/p09.webp"]',
 'Half Silk','Dry clean only.','Premium',1,0,NULL,11),

('p-midnight-coord','Midnight Bloom Co-Ord Set','midnight-bloom-co-ord-set','SHK-CO-001',
 'Printed co-ord set, top and wide trouser.',
 'A matching co-ord in a dark floral print. The top sits at the hip, the trouser falls wide and easy.',
 'cat-coord',2200,1690,13,'["S","M","L","XL"]','[{"name":"Midnight","hex":"#282125"}]','["/assets/products/p13.webp","/assets/products/p14.webp"]',
 'Crepe','Hand wash cold.','New',1,1,'2026-11-06T18:00:00Z',12),

('p-rose-coord','Rosé Charm Co-Ord','rose-charm-co-ord','SHK-CO-002',
 'Soft rose co-ord with a tie waist.',
 'A soft rose co-ord set with a tie waist and relaxed sleeves. Light enough for all day.',
 'cat-coord',2100,1750,9,'["S","M","L"]','[{"name":"Rose","hex":"#cd799b"}]','["/assets/products/p14.webp","/assets/products/p13.webp"]',
 'Linen Blend','Machine wash cold, gentle.','',0,0,NULL,13),

('p-semi-kaftan','Semi Kaftan','semi-kaftan','SHK-KA-001',
 'Relaxed semi kaftan with embroidered yoke.',
 'A semi kaftan with an embroidered yoke and open sleeves. Loose through the body, easy over everything.',
 'cat-kaftan',1900,1390,16,'["Free Size"]','[{"name":"Ivory","hex":"#fff8ef"},{"name":"Wine","hex":"#682636"}]','["/assets/products/p15.webp","/assets/products/p16.webp"]',
 'Georgette','Hand wash cold.','Best Seller',1,1,'2026-11-06T18:00:00Z',14),

('p-cords-kaftan','Co-Ords Kaftan Set','co-ords-kaftan-set','SHK-KA-002',
 'Kaftan with matching inner and trouser.',
 'A three-part kaftan set, outer kaftan with matching inner and trouser. Fully covered, fully comfortable.',
 'cat-kaftan',2600,2170,7,'["Free Size"]','[{"name":"Blush","hex":"#e0bdc6"}]','["/assets/products/p16.webp","/assets/products/p15.webp"]',
 'Chiffon with Cotton Inner','Dry clean recommended.','',0,0,NULL,15),

('p-anarkali-gown','Anarkali Premium Gown','anarkali-premium-gown','SHK-GO-001',
 'Floor-length Anarkali with flared panels.',
 'A floor-length Anarkali built from flared panels, with a fitted bodice and hand-finished neckline. For the big nights.',
 'cat-gown',4800,3990,5,'["38","40","42"]','[{"name":"Wine","hex":"#682636"}]','["/assets/products/p05.webp","/assets/products/p08.webp"]',
 'Georgette with Satin Lining','Dry clean only.','Premium',1,1,'2026-11-06T18:00:00Z',16),

('p-round-party-dress','Round Party Dress','round-party-dress','SHK-GO-002',
 'Flared party dress with a round yoke.',
 'A flared party dress with a round yoke and three-quarter sleeves. Pairs with flats or heels.',
 'cat-gown',2500,1250,10,'["S","M","L","XL"]','[{"name":"Emerald","hex":"#417553"},{"name":"Wine","hex":"#682636"}]','["/assets/products/p07.webp","/assets/products/p06.webp"]',
 'Crepe','Hand wash cold.','50% Off',0,1,'2026-11-06T18:00:00Z',17),

('p-jamdani-dupatta','Jamdani Dupatta','jamdani-dupatta','SHK-DU-001',
 'Handwoven Jamdani dupatta, sold separately.',
 'A handwoven Jamdani dupatta to finish a plain kameez. Light, and it holds a drape well.',
 'cat-dupatta',1800,1450,20,'["Free Size"]','[{"name":"Off White","hex":"#f4eeeb"},{"name":"Rose","hex":"#cd799b"}]','["/assets/texture/detail-1.webp","/assets/products/p11.webp"]',
 'Cotton Jamdani','Hand wash separately.','Handloom',0,0,NULL,18),

('p-cotton-orna','Printed Cotton Orna','printed-cotton-orna','SHK-DU-002',
 'Block-printed cotton orna.',
 'A block-printed cotton orna in everyday colours. Buy two, they go with everything.',
 'cat-dupatta',750,580,35,'["Free Size"]','[{"name":"Mustard","hex":"#c69b4e"},{"name":"Teal","hex":"#2f6f6a"}]','["/assets/texture/fabric-2.webp","/assets/texture/fabric-3.webp"]',
 'Cotton Voile','Machine wash cold.','',0,1,'2026-11-06T18:00:00Z',19),

('p-winter-shawl','Wool Blend Winter Shawl','wool-blend-winter-shawl','SHK-WI-001',
 'Soft wool blend shawl for Dhaka winter.',
 'A soft wool blend shawl, warm without the weight. Wide enough to wrap twice.',
 'cat-winter',2200,1790,17,'["Free Size"]','[{"name":"Wine","hex":"#682636"},{"name":"Charcoal","hex":"#3d3a3c"}]','["/assets/texture/fabric-1.webp","/assets/texture/fabric-4.webp"]',
 'Wool Blend','Dry clean only.','New',1,0,NULL,20),

('p-winter-koti','Cotton Koti','cotton-koti','SHK-WI-002',
 'Quilted cotton koti to layer over a kameez.',
 'A quilted cotton koti that layers over any kameez. Front buttons, two pockets.',
 'cat-winter',1690,1290,12,'["S","M","L","XL"]','[{"name":"Olive","hex":"#6b7355"},{"name":"Wine","hex":"#682636"}]','["/assets/products/p04.webp","/assets/products/p02.webp"]',
 'Quilted Cotton','Machine wash cold.','',0,1,'2026-11-06T18:00:00Z',21),

('p-farshi-set','Farshi Three Piece Set','farshi-three-piece-set','SHK-TP-006',
 'Farshi-style wide palazzo with a short kameez.',
 'A farshi set, wide palazzo with a shorter kameez and a light dupatta. The silhouette everyone is asking for.',
 'cat-tp-premium',2800,1990,14,'["36","38","40","42"]','[{"name":"Blush","hex":"#e0bdc6"},{"name":"Wine","hex":"#682636"}]','["/assets/products/p13.webp","/assets/products/p16.webp"]',
 'Viscose Georgette','Hand wash cold.','Trending',1,1,'2026-11-06T18:00:00Z',22),

('p-pearl-work','Pearl Work Three Piece','pearl-work-three-piece','SHK-TP-007',
 'Pearl detailing across the yoke and cuffs.',
 'Hand-set pearl detailing across the yoke and cuffs, on a plain base that lets the work show.',
 'cat-tp-premium',1590,999,19,'["36","38","40","42","44"]','[{"name":"Ivory","hex":"#fff8ef"}]','["/assets/products/p01.webp","/assets/products/p03.webp"]',
 'Premium Cotton','Hand wash. Do not wring.','37% Off',0,1,'2026-11-06T18:00:00Z',23),

('p-nayra-cut','Nayra Cut Two Piece','nayra-cut-two-piece','SHK-TP-008',
 'Nayra cut kameez with a straight trouser.',
 'The Nayra cut, gathered from the yoke for a soft fall, with a straight trouser. Two pieces, no dupatta.',
 'cat-tp-cotton',1650,1050,21,'["36","38","40","42"]','[{"name":"Sky","hex":"#9bb7cc"},{"name":"Rose","hex":"#cd799b"}]','["/assets/products/p09.webp","/assets/products/p10.webp"]',
 'Cotton Cambric','Machine wash cold.','Trending',0,1,'2026-11-06T18:00:00Z',24);

-- ------------------------------------------------------------------- coupons
INSERT OR REPLACE INTO coupons (id,code,description,type,value,min_order,max_discount,usage_limit,expires_at) VALUES
  ('cp-welcome','SHOUKHIN10','10% off your first order','percent',10,1500,500,NULL,'2026-12-31T23:59:59Z'),
  ('cp-eid','EID200','Flat 200 off above 2500','fixed',200,2500,NULL,500,'2026-12-31T23:59:59Z'),
  ('cp-freeship','FREESHIP','Free delivery anywhere in Bangladesh','free_shipping',0,3000,NULL,NULL,'2026-12-31T23:59:59Z');

-- ------------------------------------------------------------------ settings
INSERT OR REPLACE INTO settings (key,value) VALUES
  ('store_name','Shoukhin'),
  ('tagline','Thoughtfully yours'),
  ('hotline','+8801XXXXXXXXX'),
  ('email','hello@shoukhin.com.bd'),
  ('address','Mohammadpur, Dhaka 1207, Bangladesh'),
  ('whatsapp_number','8801XXXXXXXXX'),
  ('messenger_username',''),
  ('facebook_url',''),
  ('instagram_url',''),
  ('announcement','Free delivery on orders over 3000 Taka · Cash on delivery all over Bangladesh'),
  ('delivery_inside_dhaka','70'),
  ('delivery_outside_dhaka','130'),
  ('free_delivery_threshold','3000'),
  ('bkash_number','01XXXXXXXXX'),
  ('nagad_number','01XXXXXXXXX'),
  ('rocket_number','01XXXXXXXXX'),
  ('cod_enabled','1'),
  ('return_days','7'),
  ('meta_page_id',''),
  ('meta_page_token',''),
  ('meta_verify_token',''),
  ('meta_app_secret',''),
  ('whatsapp_phone_id',''),
  ('whatsapp_token','');
