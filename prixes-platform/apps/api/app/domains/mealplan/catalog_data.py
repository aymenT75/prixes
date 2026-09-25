# ruff: noqa: E501 — one recipe per line is the point of this file.
"""Le catalogue de recettes de Prixes — written for Prixes, copied from nowhere.

The free weekly menu is composed from these recipes instead of a paid model: no
cost per menu, the same pricing and store comparison as the AI menu. Amounts are
PER PERSON and get multiplied by the household size.

One recipe per line, fields separated by " | ":

    title | equipment | styles | allergens | tags | cost | ingredients

- equipment: what the recipe needs, among plaques, four, micro-ondes, airfryer,
  robot, autocuiseur (comma-separated).
- styles: rapide, healthy, classique, economique, reconfort, one-pot, monde.
- allergens: the 14 regulated allergens, spelled as in the app's profile.
- tags: viande, porc, poisson, fruits de mer, alcool — what the diets exclude.
- cost: 1 cheap, 2 medium, 3 dear (per person, before prices are known).
- ingredients: "name:amount:unit:category" separated by ";". Categories are short
  codes (fl fruits-légumes, bo boucherie, po poissonnerie, cr crèmerie,
  es épicerie salée, su épicerie sucrée, sg surgelés, bl boulangerie).

"-" means none. Salt, pepper and water are left out: every kitchen has them.
"""

RECIPES = """
Pâtes à la sauce tomate et basilic | plaques | rapide,economique,classique | gluten | - | 1 | pâtes:110:g:es; coulis de tomate:120:g:es; oignon:0.25:pièce:fl; ail:1:pièce:fl; basilic:0.1:botte:fl; huile d'olive:1:cl:es
Spaghetti à la carbonara | plaques | rapide,classique,reconfort | gluten,lait,œufs | viande,porc | 1 | spaghetti:110:g:es; lardons:60:g:bo; œufs:1:pièce:cr; parmesan:20:g:cr
Spaghetti bolognaise | plaques | classique,reconfort | gluten,céleri | viande | 2 | spaghetti:110:g:es; bœuf haché:100:g:bo; coulis de tomate:120:g:es; carotte:0.5:pièce:fl; oignon:0.25:pièce:fl; céleri:0.25:pièce:fl
Lasagnes au bœuf | four,plaques | classique,reconfort | gluten,lait | viande | 2 | feuilles de lasagne:80:g:es; bœuf haché:110:g:bo; coulis de tomate:150:g:es; lait:10:cl:cr; beurre:10:g:cr; farine:10:g:es; emmental râpé:30:g:cr
Lasagnes aux légumes et ricotta | four,plaques | healthy,reconfort | gluten,lait | - | 2 | feuilles de lasagne:80:g:es; courgette:0.5:pièce:fl; aubergine:0.3:pièce:fl; ricotta:60:g:cr; coulis de tomate:150:g:es; mozzarella:40:g:cr
Pâtes au pesto et tomates cerises | plaques | rapide,healthy | gluten,lait,fruits à coque | - | 2 | pâtes:110:g:es; pesto:30:g:es; tomates cerises:100:g:fl; parmesan:10:g:cr
One pot pasta tomate épinards | plaques | one-pot,rapide,economique | gluten,lait | - | 1 | pâtes:110:g:es; tomates concassées:0.5:boîte:es; épinards:60:g:fl; oignon:0.25:pièce:fl; ail:1:pièce:fl; parmesan:15:g:cr
Pâtes au saumon et crème | plaques | rapide,classique | gluten,lait,poisson | poisson | 3 | tagliatelles:110:g:es; saumon fumé:60:g:po; crème fraîche:5:cl:cr; aneth:0.1:botte:fl; citron:0.25:pièce:fl
Coquillettes jambon fromage | plaques | rapide,reconfort,economique | gluten,lait | viande,porc | 1 | coquillettes:110:g:es; jambon blanc:1:tranche:bo; emmental râpé:30:g:cr; beurre:10:g:cr
Gratin de pâtes au fromage | four,plaques | reconfort,economique | gluten,lait | - | 1 | macaronis:100:g:es; lait:12:cl:cr; beurre:10:g:cr; farine:10:g:es; emmental râpé:40:g:cr
Penne all'arrabbiata | plaques | rapide,economique,monde | gluten | - | 1 | penne:110:g:es; tomates concassées:0.5:boîte:es; ail:1:pièce:fl; piment:0.25:pièce:fl; persil:0.1:botte:fl; huile d'olive:1:cl:es
Pâtes aux champignons et crème | plaques | rapide,reconfort | gluten,lait | - | 2 | tagliatelles:110:g:es; champignons de Paris:120:g:fl; crème fraîche:5:cl:cr; échalote:0.5:pièce:fl; persil:0.1:botte:fl
Pâtes au thon et à la tomate | plaques | rapide,economique | gluten,poisson | poisson | 1 | pâtes:110:g:es; thon au naturel:0.5:boîte:es; coulis de tomate:120:g:es; oignon:0.25:pièce:fl; olives noires:15:g:es
Risotto aux champignons | plaques | reconfort,classique | lait | - | 2 | riz arborio:80:g:es; champignons de Paris:120:g:fl; bouillon de légumes:1:pièce:es; parmesan:20:g:cr; oignon:0.25:pièce:fl; beurre:10:g:cr
Risotto aux petits pois et citron | plaques | healthy,reconfort | lait | - | 2 | riz arborio:80:g:es; petits pois surgelés:80:g:sg; citron:0.25:pièce:fl; parmesan:20:g:cr; bouillon de légumes:1:pièce:es; échalote:0.5:pièce:fl
Riz sauté aux légumes et œufs | plaques | rapide,economique,monde | œufs,soja | - | 1 | riz:80:g:es; œufs:1:pièce:cr; carotte:0.5:pièce:fl; petits pois surgelés:50:g:sg; oignon nouveau:1:pièce:fl; sauce soja:1:cl:es
Riz cantonais | plaques | rapide,monde,reconfort | œufs,soja | viande,porc | 1 | riz:80:g:es; jambon blanc:1:tranche:bo; œufs:1:pièce:cr; petits pois surgelés:50:g:sg; sauce soja:1:cl:es
Poulet au curry et riz | plaques | monde,reconfort | lait | viande | 2 | blanc de poulet:130:g:bo; riz basmati:80:g:es; lait de coco:10:cl:es; curry en poudre:3:g:es; oignon:0.5:pièce:fl
Curry de pois chiches au lait de coco | plaques | monde,healthy,economique,one-pot | - | - | 1 | pois chiches:0.5:boîte:es; lait de coco:10:cl:es; tomates concassées:0.3:boîte:es; épinards:50:g:fl; curry en poudre:3:g:es; riz basmati:70:g:es
Dahl de lentilles corail | plaques | monde,healthy,economique,one-pot | - | - | 1 | lentilles corail:80:g:es; lait de coco:8:cl:es; tomates concassées:0.3:boîte:es; oignon:0.5:pièce:fl; gingembre:5:g:fl; curry en poudre:3:g:es
Chili con carne | plaques | monde,reconfort,one-pot | - | viande | 2 | bœuf haché:110:g:bo; haricots rouges:0.5:boîte:es; tomates concassées:0.5:boîte:es; poivron:0.5:pièce:fl; oignon:0.5:pièce:fl; riz:70:g:es
Chili sin carne | plaques | monde,healthy,economique,one-pot | - | - | 1 | haricots rouges:0.5:boîte:es; maïs:0.25:boîte:es; tomates concassées:0.5:boîte:es; poivron:0.5:pièce:fl; oignon:0.5:pièce:fl; riz:70:g:es
Poulet rôti et pommes de terre | four | classique,reconfort | - | viande | 2 | cuisse de poulet:1:pièce:bo; pommes de terre:250:g:fl; oignon:0.5:pièce:fl; thym:0.1:botte:fl; huile d'olive:1:cl:es
Cuisses de poulet à l'airfryer et haricots verts | airfryer,plaques | rapide,healthy | - | viande | 2 | cuisse de poulet:1:pièce:bo; haricots verts:150:g:fl; paprika:2:g:es; ail:1:pièce:fl
Blanc de poulet à la crème et champignons | plaques | classique,reconfort | lait | viande | 2 | blanc de poulet:130:g:bo; champignons de Paris:100:g:fl; crème fraîche:5:cl:cr; riz:70:g:es; échalote:0.5:pièce:fl
Poulet basquaise | plaques | classique,monde,one-pot | - | viande | 2 | cuisse de poulet:1:pièce:bo; poivron:1:pièce:fl; tomates concassées:0.5:boîte:es; oignon:0.5:pièce:fl; riz:70:g:es
Poulet tikka express | plaques | monde,rapide | lait | viande | 2 | blanc de poulet:130:g:bo; yaourt nature:0.5:pot:cr; épices tikka:5:g:es; tomates concassées:0.3:boîte:es; riz basmati:70:g:es
Poulet teriyaki et riz | plaques | monde,rapide | soja,gluten,sésame | viande | 2 | blanc de poulet:130:g:bo; sauce teriyaki:3:cl:es; riz:80:g:es; brocoli:120:g:fl; graines de sésame:3:g:es
Wok de poulet aux légumes | plaques | rapide,healthy,monde | soja,gluten | viande | 2 | blanc de poulet:120:g:bo; nouilles chinoises:70:g:es; poivron:0.5:pièce:fl; carotte:0.5:pièce:fl; sauce soja:2:cl:es
Nuggets de poulet maison et frites au four | four,airfryer | reconfort | gluten,œufs | viande | 2 | blanc de poulet:130:g:bo; chapelure:25:g:es; œufs:0.5:pièce:cr; pommes de terre:250:g:fl
Tajine de poulet aux olives et citron | plaques | monde,reconfort | - | viande | 2 | cuisse de poulet:1:pièce:bo; olives vertes:30:g:es; citron confit:0.25:pièce:es; oignon:0.5:pièce:fl; semoule:70:g:es
Couscous aux légumes et pois chiches | plaques | monde,healthy,economique | gluten | - | 1 | semoule:80:g:es; pois chiches:0.3:boîte:es; carotte:1:pièce:fl; courgette:0.5:pièce:fl; navet:0.5:pièce:fl; tomates concassées:0.3:boîte:es
Couscous au poulet et merguez | plaques | monde,reconfort | gluten | viande | 3 | semoule:80:g:es; cuisse de poulet:1:pièce:bo; merguez:1:pièce:bo; carotte:1:pièce:fl; courgette:0.5:pièce:fl; pois chiches:0.3:boîte:es
Hachis parmentier | four,plaques | classique,reconfort | lait | viande | 2 | bœuf haché:100:g:bo; pommes de terre:250:g:fl; lait:8:cl:cr; beurre:10:g:cr; oignon:0.25:pièce:fl; emmental râpé:20:g:cr
Parmentier de lentilles | four,plaques | healthy,economique,reconfort | lait | - | 1 | lentilles vertes:70:g:es; pommes de terre:250:g:fl; carotte:0.5:pièce:fl; lait:8:cl:cr; emmental râpé:20:g:cr
Steak haché, purée maison | plaques | rapide,classique,reconfort | lait | viande | 2 | steak haché:1:pièce:bo; pommes de terre:250:g:fl; lait:8:cl:cr; beurre:10:g:cr
Bœuf bourguignon | plaques,autocuiseur | classique,reconfort | sulfites | viande,alcool | 3 | bœuf à braiser:170:g:bo; vin rouge:10:cl:es; carotte:1:pièce:fl; champignons de Paris:60:g:fl; oignon:0.5:pièce:fl; pommes de terre:200:g:fl
Bœuf aux carottes | plaques,autocuiseur | classique,reconfort,one-pot | - | viande | 2 | bœuf à braiser:160:g:bo; carotte:2:pièce:fl; oignon:0.5:pièce:fl; bouillon de bœuf:1:pièce:es
Pot-au-feu | plaques,autocuiseur | classique,reconfort,one-pot | céleri | viande | 3 | bœuf à braiser:180:g:bo; carotte:1:pièce:fl; poireau:0.5:pièce:fl; navet:1:pièce:fl; pommes de terre:200:g:fl; céleri:0.25:pièce:fl
Boulettes de bœuf sauce tomate | plaques | reconfort,classique | gluten,œufs | viande | 2 | bœuf haché:120:g:bo; chapelure:15:g:es; œufs:0.25:pièce:cr; coulis de tomate:150:g:es; pâtes:90:g:es
Burger maison et potatoes | plaques,four | reconfort | gluten,lait,sésame | viande | 2 | steak haché:1:pièce:bo; pain à burger:1:pièce:bl; cheddar:1:tranche:cr; tomate:0.5:pièce:fl; salade:0.1:pièce:fl; pommes de terre:200:g:fl
Tacos de bœuf maison | plaques | monde,rapide | gluten,lait | viande | 2 | bœuf haché:110:g:bo; tortillas:2:pièce:es; tomate:0.5:pièce:fl; salade:0.1:pièce:fl; cheddar râpé:20:g:cr; épices mexicaines:3:g:es
Fajitas au poulet | plaques | monde,rapide | gluten,lait | viande | 2 | blanc de poulet:120:g:bo; tortillas:2:pièce:es; poivron:0.5:pièce:fl; oignon:0.5:pièce:fl; crème fraîche:3:cl:cr; épices mexicaines:3:g:es
Quesadillas aux haricots et fromage | plaques | monde,rapide,economique | gluten,lait | - | 1 | tortillas:2:pièce:es; haricots rouges:0.3:boîte:es; cheddar râpé:40:g:cr; maïs:0.2:boîte:es; poivron:0.25:pièce:fl
Saucisses lentilles | plaques | classique,reconfort,economique,one-pot | - | viande,porc | 1 | saucisse de Toulouse:1:pièce:bo; lentilles vertes:80:g:es; carotte:0.5:pièce:fl; oignon:0.25:pièce:fl
Rôti de porc et haricots blancs | four,plaques | classique | - | viande,porc | 2 | rôti de porc:150:g:bo; haricots blancs:0.5:boîte:es; oignon:0.25:pièce:fl; thym:0.1:botte:fl
Côtes de porc à la moutarde et purée | plaques | classique,reconfort | moutarde,lait | viande,porc | 2 | côte de porc:1:pièce:bo; moutarde:10:g:es; crème fraîche:3:cl:cr; pommes de terre:250:g:fl; lait:8:cl:cr
Croque-monsieur et salade verte | four | rapide,reconfort,economique | gluten,lait | viande,porc | 1 | pain de mie:2:tranche:bl; jambon blanc:1:tranche:bo; emmental râpé:25:g:cr; beurre:10:g:cr; salade:0.15:pièce:fl
Quiche lorraine et salade | four | classique | gluten,lait,œufs | viande,porc | 1 | pâte brisée:0.25:pièce:cr; lardons:40:g:bo; œufs:1:pièce:cr; crème fraîche:5:cl:cr; salade:0.15:pièce:fl
Quiche poireaux et chèvre | four,plaques | classique,healthy | gluten,lait,œufs | - | 2 | pâte brisée:0.25:pièce:cr; poireau:0.5:pièce:fl; fromage de chèvre:30:g:cr; œufs:1:pièce:cr; crème fraîche:4:cl:cr
Tarte à la tomate et moutarde | four | economique,classique | gluten,moutarde,lait | - | 1 | pâte brisée:0.25:pièce:cr; tomate:1.5:pièce:fl; moutarde:10:g:es; emmental râpé:20:g:cr
Tarte flambée maison | four | rapide,reconfort | gluten,lait | viande,porc | 1 | pâte à pizza:0.25:pièce:cr; crème fraîche:5:cl:cr; lardons:40:g:bo; oignon:0.5:pièce:fl
Pizza margherita maison | four | classique,reconfort,economique | gluten,lait | - | 1 | pâte à pizza:0.5:pièce:cr; coulis de tomate:80:g:es; mozzarella:60:g:cr; basilic:0.1:botte:fl
Pizza jambon champignons | four | reconfort,classique | gluten,lait | viande,porc | 2 | pâte à pizza:0.5:pièce:cr; coulis de tomate:80:g:es; jambon blanc:1:tranche:bo; champignons de Paris:60:g:fl; mozzarella:50:g:cr
Pizza aux légumes grillés | four | healthy,reconfort | gluten,lait | - | 2 | pâte à pizza:0.5:pièce:cr; coulis de tomate:80:g:es; courgette:0.3:pièce:fl; poivron:0.3:pièce:fl; mozzarella:50:g:cr
Gratin dauphinois et jambon | four | classique,reconfort | lait | viande,porc | 2 | pommes de terre:280:g:fl; crème fraîche:8:cl:cr; lait:8:cl:cr; ail:1:pièce:fl; jambon blanc:1:tranche:bo
Gratin de courgettes | four | healthy,economique | lait,œufs | - | 1 | courgette:1.5:pièce:fl; œufs:1:pièce:cr; crème fraîche:4:cl:cr; emmental râpé:25:g:cr
Gratin de chou-fleur | four,plaques | healthy,reconfort | lait,gluten | - | 1 | chou-fleur:0.35:pièce:fl; lait:12:cl:cr; beurre:10:g:cr; farine:10:g:es; emmental râpé:25:g:cr
Tartiflette | four,plaques | reconfort,classique | lait | viande,porc | 2 | pommes de terre:280:g:fl; reblochon:0.25:pièce:cr; lardons:50:g:bo; oignon:0.5:pièce:fl; crème fraîche:4:cl:cr
Raclette | plaques | reconfort | lait | viande,porc | 3 | pommes de terre:300:g:fl; fromage à raclette:200:g:cr; jambon cru:2:tranche:bo; cornichons:30:g:es
Omelette aux champignons et salade | plaques | rapide,economique,healthy | œufs | - | 1 | œufs:3:pièce:cr; champignons de Paris:80:g:fl; persil:0.1:botte:fl; salade:0.15:pièce:fl
Omelette aux pommes de terre | plaques | economique,classique,reconfort | œufs | - | 1 | œufs:3:pièce:cr; pommes de terre:200:g:fl; oignon:0.5:pièce:fl; huile d'olive:1:cl:es
Frittata aux légumes du soleil | plaques,four | healthy,rapide | œufs,lait | - | 1 | œufs:3:pièce:cr; courgette:0.5:pièce:fl; poivron:0.5:pièce:fl; fromage de chèvre:25:g:cr
Shakshuka aux œufs et poivrons | plaques | monde,economique,one-pot | œufs,gluten | - | 1 | œufs:2:pièce:cr; tomates concassées:0.5:boîte:es; poivron:0.5:pièce:fl; oignon:0.5:pièce:fl; pain:0.25:pièce:bl; cumin:2:g:es
Œufs cocotte aux épinards | four | rapide,healthy | œufs,lait,gluten | - | 1 | œufs:2:pièce:cr; épinards:80:g:fl; crème fraîche:3:cl:cr; pain:0.25:pièce:bl
Crêpes salées jambon fromage | plaques | reconfort,economique | gluten,lait,œufs | viande,porc | 1 | farine:60:g:es; lait:15:cl:cr; œufs:1:pièce:cr; jambon blanc:1:tranche:bo; emmental râpé:30:g:cr
Galettes de sarrasin complètes | plaques | classique,reconfort | lait,œufs | viande,porc | 2 | farine de sarrasin:60:g:es; œufs:1:pièce:cr; jambon blanc:1:tranche:bo; emmental râpé:30:g:cr; beurre:10:g:cr
Soupe de légumes et tartines | plaques,robot | healthy,economique,one-pot | gluten,céleri | - | 1 | carotte:1:pièce:fl; poireau:0.5:pièce:fl; pommes de terre:150:g:fl; céleri:0.2:pièce:fl; pain:0.25:pièce:bl
Velouté de potiron | plaques,robot | healthy,reconfort,economique | lait | - | 1 | potiron:300:g:fl; pommes de terre:100:g:fl; oignon:0.25:pièce:fl; crème fraîche:3:cl:cr
Velouté de brocoli au fromage frais | plaques,robot | healthy,rapide | lait | - | 1 | brocoli:250:g:fl; pommes de terre:100:g:fl; fromage frais:30:g:cr; bouillon de légumes:1:pièce:es
Soupe de lentilles corail et carottes | plaques,robot | healthy,economique,monde | - | - | 1 | lentilles corail:60:g:es; carotte:1:pièce:fl; oignon:0.25:pièce:fl; cumin:2:g:es; lait de coco:5:cl:es
Minestrone | plaques | healthy,monde,one-pot | gluten,céleri | - | 1 | petites pâtes:40:g:es; haricots blancs:0.3:boîte:es; courgette:0.5:pièce:fl; carotte:0.5:pièce:fl; tomates concassées:0.3:boîte:es; céleri:0.2:pièce:fl
Soupe à l'oignon gratinée | plaques,four | classique,reconfort,economique | gluten,lait | - | 1 | oignon:2:pièce:fl; bouillon de légumes:1:pièce:es; pain:0.25:pièce:bl; emmental râpé:30:g:cr; beurre:10:g:cr
Ramen au poulet et œuf | plaques | monde,reconfort | gluten,œufs,soja | viande | 2 | nouilles ramen:80:g:es; blanc de poulet:100:g:bo; œufs:1:pièce:cr; bouillon de volaille:1:pièce:es; sauce soja:2:cl:es; oignon nouveau:1:pièce:fl
Soupe miso tofu et nouilles | plaques | monde,healthy,rapide | soja,gluten | - | 2 | pâte miso:20:g:es; tofu:80:g:cr; nouilles udon:80:g:es; épinards:40:g:fl; oignon nouveau:1:pièce:fl
Pad thaï aux crevettes | plaques | monde | crustacés,arachides,œufs,poisson,soja | fruits de mer,poisson | 3 | nouilles de riz:80:g:es; crevettes:100:g:po; œufs:1:pièce:cr; cacahuètes:15:g:es; sauce soja:1:cl:es; citron vert:0.5:pièce:fl
Nouilles sautées au tofu | plaques | monde,rapide,healthy | soja,gluten,sésame | - | 2 | nouilles chinoises:80:g:es; tofu:100:g:cr; poivron:0.5:pièce:fl; carotte:0.5:pièce:fl; sauce soja:2:cl:es; graines de sésame:3:g:es
Bibimbap aux légumes et œuf | plaques | monde,healthy | œufs,soja,sésame | - | 2 | riz:80:g:es; œufs:1:pièce:cr; carotte:0.5:pièce:fl; épinards:60:g:fl; courgette:0.3:pièce:fl; sauce soja:1:cl:es; graines de sésame:3:g:es
Poké bowl au saumon | plaques | healthy,monde | poisson,soja,sésame | poisson | 3 | riz:80:g:es; saumon frais:100:g:po; avocat:0.5:pièce:fl; concombre:0.3:pièce:fl; sauce soja:1:cl:es; graines de sésame:3:g:es
Buddha bowl pois chiches et patate douce | four | healthy,monde | sésame | - | 2 | patate douce:200:g:fl; pois chiches:0.4:boîte:es; quinoa:60:g:es; épinards:40:g:fl; tahini:10:g:es
Salade de quinoa, feta et concombre | plaques | healthy,rapide | lait | - | 2 | quinoa:70:g:es; feta:40:g:cr; concombre:0.3:pièce:fl; tomates cerises:80:g:fl; olives noires:15:g:es; citron:0.25:pièce:fl
Taboulé au boulgour et crudités | plaques | healthy,economique,monde | gluten | - | 1 | boulgour:70:g:es; tomate:1:pièce:fl; concombre:0.3:pièce:fl; persil:0.2:botte:fl; menthe:0.1:botte:fl; citron:0.5:pièce:fl
Salade niçoise | plaques | healthy,classique | œufs,poisson | poisson | 2 | thon au naturel:0.5:boîte:es; œufs:1:pièce:cr; haricots verts:80:g:fl; tomate:1:pièce:fl; olives noires:15:g:es; salade:0.15:pièce:fl
Salade César au poulet | plaques | healthy,classique | gluten,lait,œufs,poisson | viande | 2 | blanc de poulet:110:g:bo; salade romaine:0.3:pièce:fl; parmesan:15:g:cr; croûtons:15:g:bl; sauce César:3:cl:es
Salade de lentilles, œuf et échalote | plaques | healthy,economique | œufs,moutarde | - | 1 | lentilles vertes:70:g:es; œufs:1:pièce:cr; échalote:0.5:pièce:fl; moutarde:5:g:es; persil:0.1:botte:fl
Salade de pâtes au thon et maïs | plaques | rapide,economique | gluten,poisson,œufs | poisson | 1 | pâtes:90:g:es; thon au naturel:0.4:boîte:es; maïs:0.25:boîte:es; tomate:0.5:pièce:fl; mayonnaise:15:g:es
Saumon au four, riz et brocoli | four,plaques | healthy,classique | poisson | poisson | 3 | pavé de saumon:1:pièce:po; riz:70:g:es; brocoli:150:g:fl; citron:0.25:pièce:fl
Cabillaud en papillote et légumes | four | healthy | poisson | poisson | 3 | dos de cabillaud:1:pièce:po; courgette:0.5:pièce:fl; tomates cerises:80:g:fl; citron:0.25:pièce:fl; pommes de terre:180:g:fl
Poisson pané et purée de carottes | plaques | rapide,economique,reconfort | gluten,poisson,lait | poisson | 1 | poisson pané surgelé:2:pièce:sg; carotte:2:pièce:fl; pommes de terre:100:g:fl; beurre:10:g:cr
Brandade de morue express | four,plaques | classique,reconfort | poisson,lait | poisson | 2 | cabillaud:120:g:po; pommes de terre:230:g:fl; lait:8:cl:cr; ail:1:pièce:fl; huile d'olive:2:cl:es
Curry de crevettes au lait de coco | plaques | monde | crustacés | fruits de mer | 3 | crevettes:120:g:po; lait de coco:10:cl:es; tomates concassées:0.3:boîte:es; curry en poudre:3:g:es; riz basmati:70:g:es
Moules marinières et frites | plaques,four | classique | mollusques,lait,sulfites | fruits de mer,alcool | 2 | moules:500:g:po; vin blanc:5:cl:es; échalote:0.5:pièce:fl; crème fraîche:3:cl:cr; frites surgelées:200:g:sg
Paella au poulet et chorizo | plaques | monde,one-pot | crustacés | viande,porc,fruits de mer | 3 | riz rond:80:g:es; cuisse de poulet:1:pièce:bo; chorizo:30:g:bo; crevettes:60:g:po; petits pois surgelés:40:g:sg; poivron:0.5:pièce:fl
Ratatouille et semoule | plaques | healthy,economique,classique | gluten | - | 1 | courgette:0.5:pièce:fl; aubergine:0.5:pièce:fl; poivron:0.5:pièce:fl; tomate:1:pièce:fl; oignon:0.5:pièce:fl; semoule:70:g:es
Tian de légumes provençal | four | healthy,economique | - | - | 1 | courgette:0.7:pièce:fl; aubergine:0.4:pièce:fl; tomate:1:pièce:fl; oignon:0.3:pièce:fl; thym:0.1:botte:fl; huile d'olive:1:cl:es
Poivrons farcis au riz et au bœuf | four,plaques | classique,reconfort | - | viande | 2 | poivron:1.5:pièce:fl; bœuf haché:90:g:bo; riz:40:g:es; coulis de tomate:80:g:es; oignon:0.25:pièce:fl
Courgettes farcies végétariennes | four | healthy,economique | lait | - | 1 | courgette:1.5:pièce:fl; riz:40:g:es; tomate:0.5:pièce:fl; fromage de chèvre:30:g:cr; oignon:0.25:pièce:fl
Aubergines à la parmigiana | four,plaques | monde,reconfort | lait | - | 2 | aubergine:1:pièce:fl; coulis de tomate:150:g:es; mozzarella:50:g:cr; parmesan:15:g:cr; basilic:0.1:botte:fl
Galettes de légumes et yaourt aux herbes | plaques,airfryer | healthy,economique | gluten,œufs,lait | - | 1 | courgette:1:pièce:fl; carotte:0.5:pièce:fl; farine:25:g:es; œufs:1:pièce:cr; yaourt nature:0.5:pot:cr; ciboulette:0.1:botte:fl
Falafels maison et houmous | plaques,robot,airfryer | monde,healthy,economique | sésame,gluten | - | 1 | pois chiches:0.6:boîte:es; oignon:0.25:pièce:fl; persil:0.2:botte:fl; farine:10:g:es; tahini:10:g:es; pain pita:1:pièce:bl
Wraps au poulet et crudités | plaques | rapide,healthy | gluten,lait | viande | 2 | tortillas:2:pièce:es; blanc de poulet:100:g:bo; salade:0.1:pièce:fl; tomate:0.5:pièce:fl; fromage frais:20:g:cr
Hot-dogs maison et salade de chou | plaques | rapide,reconfort | gluten,moutarde,œufs | viande,porc | 1 | saucisse de Strasbourg:2:pièce:bo; pain à hot-dog:2:pièce:bl; chou blanc:100:g:fl; carotte:0.5:pièce:fl; mayonnaise:15:g:es; moutarde:5:g:es
Clafoutis salé tomates et feta | four | healthy,rapide | gluten,lait,œufs | - | 1 | œufs:1.5:pièce:cr; lait:10:cl:cr; farine:20:g:es; tomates cerises:120:g:fl; feta:40:g:cr
Cake salé olives et jambon | four | reconfort,economique | gluten,lait,œufs | viande,porc | 1 | farine:50:g:es; œufs:1:pièce:cr; lait:5:cl:cr; jambon blanc:1:tranche:bo; olives vertes:20:g:es; emmental râpé:25:g:cr
Chou-fleur rôti aux épices et semoule | four | healthy,monde,economique | gluten | - | 1 | chou-fleur:0.4:pièce:fl; semoule:70:g:es; cumin:2:g:es; paprika:2:g:es; pois chiches:0.25:boîte:es
Pommes de terre au four, fromage blanc aux herbes | four | economique,reconfort,rapide | lait | - | 1 | pommes de terre:300:g:fl; fromage blanc:100:g:cr; ciboulette:0.1:botte:fl; ail:1:pièce:fl
Patates douces rôties, haricots noirs et avocat | four,plaques | healthy,monde | - | - | 2 | patate douce:250:g:fl; haricots noirs:0.4:boîte:es; avocat:0.5:pièce:fl; citron vert:0.5:pièce:fl; oignon rouge:0.25:pièce:fl
Gnocchis poêlés aux épinards et parmesan | plaques | rapide,reconfort | gluten,lait | - | 2 | gnocchis:200:g:cr; épinards:80:g:fl; parmesan:15:g:cr; beurre:10:g:cr; ail:1:pièce:fl
Gnocchis à la sauce tomate et mozzarella | four,plaques | rapide,reconfort | gluten,lait | - | 1 | gnocchis:200:g:cr; coulis de tomate:120:g:es; mozzarella:50:g:cr; basilic:0.1:botte:fl
Polenta crémeuse aux champignons | plaques | reconfort,monde | lait | - | 2 | polenta:70:g:es; champignons de Paris:120:g:fl; lait:10:cl:cr; parmesan:20:g:cr; persil:0.1:botte:fl
Blanquette de poulet | plaques,autocuiseur | classique,reconfort | lait,gluten | viande | 2 | cuisse de poulet:1:pièce:bo; carotte:1:pièce:fl; champignons de Paris:60:g:fl; crème fraîche:4:cl:cr; farine:10:g:es; riz:70:g:es
Navarin d'agneau aux légumes | plaques,autocuiseur | classique,reconfort | - | viande | 3 | épaule d'agneau:160:g:bo; carotte:1:pièce:fl; navet:0.5:pièce:fl; pommes de terre:150:g:fl; petits pois surgelés:40:g:sg
Kefta à la tomate et œufs | plaques | monde,reconfort | œufs | viande | 2 | bœuf haché:110:g:bo; tomates concassées:0.5:boîte:es; œufs:1:pièce:cr; oignon:0.5:pièce:fl; cumin:2:g:es; coriandre:0.1:botte:fl
Chakchouka aux merguez | plaques | monde,reconfort | œufs | viande | 2 | merguez:1:pièce:bo; poivron:1:pièce:fl; tomates concassées:0.5:boîte:es; œufs:1:pièce:cr; oignon:0.5:pièce:fl
Soupe harira | plaques,autocuiseur | monde,reconfort,economique | gluten,céleri | viande | 1 | lentilles vertes:40:g:es; pois chiches:0.3:boîte:es; tomates concassées:0.4:boîte:es; céleri:0.2:pièce:fl; coriandre:0.1:botte:fl; vermicelles:15:g:es; bœuf à braiser:50:g:bo
Moussaka | four,plaques | monde,reconfort | lait,gluten | viande | 3 | aubergine:1:pièce:fl; bœuf haché:110:g:bo; coulis de tomate:100:g:es; lait:10:cl:cr; farine:10:g:es; beurre:10:g:cr
Fish and chips au four | four,airfryer | reconfort,monde | gluten,poisson,œufs | poisson | 2 | filet de colin:130:g:po; chapelure:25:g:es; œufs:0.5:pièce:cr; pommes de terre:250:g:fl; petits pois surgelés:60:g:sg
Filet de colin, riz et ratatouille | plaques | healthy,classique | poisson | poisson | 2 | filet de colin:130:g:po; riz:70:g:es; courgette:0.5:pièce:fl; tomate:1:pièce:fl; poivron:0.3:pièce:fl
Maquereau grillé, pommes de terre et salade | four,plaques | healthy,economique | poisson,moutarde | poisson | 2 | maquereau:1:pièce:po; pommes de terre:220:g:fl; salade:0.15:pièce:fl; moutarde:5:g:es
Croquettes de thon et salade | plaques,airfryer | economique,rapide | gluten,poisson,œufs | poisson | 1 | thon au naturel:0.5:boîte:es; pommes de terre:150:g:fl; œufs:0.5:pièce:cr; chapelure:15:g:es; salade:0.15:pièce:fl
Bowl de saumon teriyaki | plaques | monde,healthy | poisson,soja,gluten,sésame | poisson | 3 | pavé de saumon:1:pièce:po; sauce teriyaki:3:cl:es; riz:80:g:es; edamame surgelés:60:g:sg; graines de sésame:3:g:es
Endives au jambon | four,plaques | classique,reconfort | lait,gluten | viande,porc | 2 | endive:2:pièce:fl; jambon blanc:2:tranche:bo; lait:12:cl:cr; beurre:10:g:cr; farine:10:g:es; emmental râpé:25:g:cr
Poêlée de pommes de terre, lardons et oignons | plaques | reconfort,economique,one-pot | - | viande,porc | 1 | pommes de terre:280:g:fl; lardons:60:g:bo; oignon:0.5:pièce:fl; persil:0.1:botte:fl
Poêlée de légumes au tofu et riz | plaques | healthy,rapide,economique | soja | - | 1 | tofu:100:g:cr; riz:70:g:es; brocoli:100:g:fl; carotte:0.5:pièce:fl; sauce soja:1:cl:es
Chili de patate douce et haricots | plaques | healthy,monde,one-pot | - | - | 1 | patate douce:200:g:fl; haricots rouges:0.5:boîte:es; tomates concassées:0.5:boîte:es; oignon:0.5:pièce:fl; épices mexicaines:3:g:es
Curry vert de légumes | plaques | monde,healthy | - | - | 2 | pâte de curry vert:15:g:es; lait de coco:12:cl:es; courgette:0.5:pièce:fl; haricots verts:80:g:fl; riz basmati:70:g:es
Colombo de poulet | plaques | monde,reconfort | - | viande | 2 | cuisse de poulet:1:pièce:bo; poudre de colombo:4:g:es; pommes de terre:150:g:fl; courgette:0.5:pièce:fl; oignon:0.5:pièce:fl; riz:60:g:es
Mafé au poulet | plaques | monde,reconfort | arachides | viande | 2 | cuisse de poulet:1:pièce:bo; beurre de cacahuète:30:g:es; tomates concassées:0.4:boîte:es; carotte:1:pièce:fl; oignon:0.5:pièce:fl; riz:70:g:es
Poulet yassa | plaques | monde,reconfort | moutarde | viande | 2 | cuisse de poulet:1:pièce:bo; oignon:1.5:pièce:fl; citron:0.75:pièce:fl; moutarde:10:g:es; riz:70:g:es
Soupe de poulet aux vermicelles | plaques | reconfort,economique,one-pot | gluten,céleri | viande | 1 | blanc de poulet:80:g:bo; vermicelles:30:g:es; carotte:0.5:pièce:fl; céleri:0.2:pièce:fl; bouillon de volaille:1:pièce:es
Poulet rôti au micro-ondes et légumes vapeur | micro-ondes | rapide,healthy | - | viande | 2 | blanc de poulet:130:g:bo; courgette:0.5:pièce:fl; carotte:1:pièce:fl; herbes de Provence:2:g:es
Patate douce au micro-ondes, thon et fromage frais | micro-ondes | rapide,economique,healthy | poisson,lait | poisson | 1 | patate douce:250:g:fl; thon au naturel:0.4:boîte:es; fromage frais:30:g:cr; ciboulette:0.1:botte:fl
Mug omelette aux légumes | micro-ondes | rapide,economique | œufs,lait | - | 1 | œufs:2:pièce:cr; lait:3:cl:cr; poivron:0.3:pièce:fl; tomate:0.5:pièce:fl; pain:0.25:pièce:bl
Pommes de terre au micro-ondes et saumon fumé | micro-ondes | rapide | poisson,lait | poisson | 3 | pommes de terre:250:g:fl; saumon fumé:50:g:po; fromage frais:30:g:cr; aneth:0.1:botte:fl
Légumes et poisson vapeur au micro-ondes | micro-ondes | healthy,rapide | poisson | poisson | 2 | filet de colin:130:g:po; brocoli:120:g:fl; carotte:1:pièce:fl; citron:0.25:pièce:fl
Ailes de poulet à l'airfryer et coleslaw | airfryer | reconfort,rapide | œufs,moutarde | viande | 2 | ailes de poulet:250:g:bo; paprika:2:g:es; chou blanc:100:g:fl; carotte:0.5:pièce:fl; mayonnaise:15:g:es
Saumon à l'airfryer et légumes rôtis | airfryer | healthy,rapide | poisson | poisson | 3 | pavé de saumon:1:pièce:po; courgette:0.5:pièce:fl; poivron:0.5:pièce:fl; citron:0.25:pièce:fl
Pois chiches croustillants et légumes à l'airfryer | airfryer | healthy,economique,rapide | - | - | 1 | pois chiches:0.5:boîte:es; patate douce:180:g:fl; brocoli:100:g:fl; paprika:2:g:es
Potatoes et falafels à l'airfryer | airfryer | reconfort,monde | sésame,lait | - | 2 | pommes de terre:220:g:fl; falafels surgelés:5:pièce:sg; yaourt nature:0.5:pot:cr; tahini:8:g:es
Soupe de légumes au robot cuiseur | robot | healthy,economique,one-pot | céleri | - | 1 | carotte:1:pièce:fl; courgette:0.5:pièce:fl; pommes de terre:120:g:fl; céleri:0.2:pièce:fl; bouillon de légumes:1:pièce:es
Risotto au robot cuiseur, courgette et parmesan | robot | reconfort,one-pot | lait | - | 2 | riz arborio:80:g:es; courgette:0.7:pièce:fl; parmesan:20:g:cr; bouillon de légumes:1:pièce:es; oignon:0.25:pièce:fl
Poulet au riz à l'autocuiseur | autocuiseur | one-pot,reconfort,economique | - | viande | 2 | cuisse de poulet:1:pièce:bo; riz:80:g:es; carotte:1:pièce:fl; oignon:0.5:pièce:fl; bouillon de volaille:1:pièce:es
Petit salé aux lentilles à l'autocuiseur | autocuiseur | classique,reconfort,one-pot | - | viande,porc | 2 | petit salé:150:g:bo; lentilles vertes:80:g:es; carotte:1:pièce:fl; oignon:0.5:pièce:fl
Chili express à l'autocuiseur | autocuiseur | monde,one-pot,rapide | - | viande | 2 | bœuf haché:110:g:bo; haricots rouges:0.5:boîte:es; tomates concassées:0.5:boîte:es; oignon:0.5:pièce:fl; riz:70:g:es
"""
