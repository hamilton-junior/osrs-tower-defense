---
trigger: always_on
---

# OSRS Tower Defense — Regras de Assets e Design para IA

> **REGRA ABSOLUTA**: Todo e qualquer conteúdo do jogo — inimigos, torres, itens, sons, imagens, mecânicas, balanceamento — DEVE ser baseado em conteúdo existente do Old School RuneScape (OSRS). Nunca invente criaturas, itens ou mecânicas sem base na Wiki do OSRS. A única exceção permitida é uma variante "aprimorada" de um item existente, como `Dragon Slayer Ballista` a partir da `Heavy Ballista` — mas o item base deve existir de verdade no OSRS.

---

## 1. Fonte de Verdade

- **Wiki oficial**: https://oldschool.runescape.wiki/
- **Imagens**: `https://oldschool.runescape.wiki/images/[Nome_do_item].png`
- **Sons**: `https://oldschool.runescape.wiki/images/[Nome_do_som].ogg` ou `.mp3`
- Sempre que precisar de um asset, **consulte a Wiki primeiro** para confirmar que ele existe.
- Nomes devem corresponder exatamente ao nome na Wiki, com underscores substituindo espaços na URL (ex: `Dwarf_multicannon_built.png`).

---

## 2. Inimigos (NPCs)

### Regra geral
- Só use NPCs que existem no OSRS. Consulte a Wiki para confirmar Combat Level, HP, velocidade, drops e sons.
- Use a imagem oficial do NPC sem rotação artificial (o código atual rotaciona NPCs — isso deve ser removido; as imagens do OSRS já são sideways/front-facing e não devem ser giradas).

### Inimigos atualmente no jogo (EnemyType)
| ID do Código  | Nome OSRS              | Combat Level | HP (base) | Weakness       |
|---------------|------------------------|--------------|-----------|----------------|
| goblin        | Goblin                 | 2            | 5         | —              |
| rat           | Giant Rat              | 1            | 2         | —              |
| cow           | Cow                    | 2            | 8         | —              |
| imp           | Imp                    | 2            | 4         | —              |
| spider        | Giant Spider           | 2            | 5         | —              |
| scorpion      | Scorpion               | 14           | 17        | —              |
| hill_giant    | Hill Giant             | 28           | 35        | —              |
| lesser_demon  | Lesser Demon           | 82           | 79        | —              |
| green_dragon  | Green Dragon           | 79           | 75        | —              |
| blue_dragon   | Blue Dragon            | 111          | 105       | —              |
| black_demon   | Black Demon            | 172          | 157       | —              |
| abyssal_demon | Abyssal Demon          | 124          | 150       | —              |
| barrow_wight  | Dharok the Wretched    | 115          | 100       | —              |
| chaos_druid   | Chaos Druid            | 13           | 20        | —              |
| skeletal_mage | Skeletal Mage          | 40           | 40        | —              |
| skeleton      | Skeleton               | 13           | 18        | —              |
| zombie        | Zombie                 | 24           | 30        | —              |
| ghost         | Ghost                  | 19           | 25        | —              |
| hellhound     | Hellhound              | 122          | 116       | Water (magic)  |
| fire_giant    | Fire Giant             | 86           | 111       | Water          |
| bloodveld     | Bloodveld              | 76           | 120       | —              |
| gargoyle      | Gargoyle               | 111          | 105       | Fire (hammer)  |
| nechryael     | Nechryael              | 115          | 105       | —              |
| dark_beast    | Dark Beast             | 182          | 220       | —              |
| hydra         | Alchemical Hydra       | 194          | 300       | Multi          |
| jad           | TzTok-Jad              | 702          | 250       | Prayer switch  |
| vorkath       | Vorkath                | 732          | 750       | Dragonbane     |
| zulrah        | Zulrah                 | 725          | 500       | Multi-phase    |

### Adicionando novos inimigos
- Só adicione NPCs que existam no OSRS.
- O `type` deve ser snake_case do nome real (ex: `cave_horror`, `dust_devil`, etc.)
- Busque na Wiki: combat level, max HP, velocidade (~walk speed), drops típicos.
- Use a imagem da Wiki sem transformações de rotação no código.
- Atribua `deathSound` com o arquivo de áudio existente na Wiki (ex: `death_spider`).
- Atribua `weakness` apenas se o NPC tiver fraqueza verificada na Wiki.

### Exemplos de novos inimigos válidos (Wiki-confirmed)
```typescript
cave_horror:    { hp: 55,  level: 80,  speed: 100, reward: 55,  color: '#2F4F4F', deathSound: 'death_human' }
dust_devil:     { hp: 105, level: 93,  speed: 110, reward: 70,  color: '#c2a04e', weakness: 'air' }
spiritual_mage: { hp: 100, level: 120, speed: 90,  reward: 80,  color: '#8B008B' }
aberrant_spectre:{ hp: 90, level: 96,  speed: 100, reward: 65,  color: '#90EE90' }
kurask:         { hp: 200, level: 106, speed: 80,  reward: 90,  color: '#a8d854', deathSound: 'death_human' }
```

---

## 3. Torres

### Regra geral
- Torres representam **equipamentos reais do OSRS** (armas, staves, canhões).
- Cada nível de upgrade deve ser um item real do OSRS, em ordem crescente de tier.
- A única exceção é nomes fictícios derivados de itens reais (ex: `Dragon Slayer Ballista` a partir de `Heavy Ballista`).

### Torres atuais e progressão de upgrades

#### Archer Tower (Ranged — Bows)
| Nível | Nome OSRS              | Max Hit OSRS | Image Key                  |
|-------|------------------------|--------------|----------------------------|
| 1     | Shortbow               | ~17          | `archer_1` → Shortbow.png |
| 2     | Magic Shortbow         | ~26          | `archer_2` → Magic_shortbow.png |
| 3     | Crystal Bow            | ~38          | `archer_3` → Crystal_bow.png |
| 4     | Bow of Faerdhinen      | ~53          | `archer_4` → Bow_of_faerdhinen.png |

#### Wizard Tower (Magic — Spells)
| Nível | Nome OSRS                    | Max Hit | Image Key                     |
|-------|------------------------------|---------|-------------------------------|
| 1     | [Element] Strike (Air/Water/Earth/Fire) | ~8 | `wizard_elemental_[element]` |
| 2     | [Element] Bolt               | ~12     | (mesmo staff por element)     |
| 3     | [Element] Blast / Ice Blitz  | ~18     | `wizard_ancients`             |
| 4     | Ice Barrage / Tumeken's Shadow | ~29    | `wizard_4` → Tumeken%27s_shadow.png |

#### Cannon Tower (Ranged — Cannons/Ballistas)
| Nível | Nome OSRS                | Max Hit | Image Key                          |
|-------|--------------------------|---------|------------------------------------|
| 1     | Dwarf Multicannon        | 30      | `cannon_1` → Dwarf_multicannon_built.png |
| 2     | Granite Multicannon      | 40      | `cannon_3` → Granite_multicannon.png |
| 3     | Heavy Ballista           | ~84     | `cannon_4` → Heavy_ballista.png    |
| 4     | Dragon Hunter Ballista *(fictício baseado em Heavy Ballista)* | 84+ | mesmo .png |

#### TzHaar Tower (Melee — TzHaar weapons)
| Nível | Nome OSRS              | Max Hit | Image Key                         |
|-------|------------------------|---------|-----------------------------------|
| 1     | TzHaar-Ket             | ~35     | `tzhaar_1` → TzHaar-Ket.png      |
| 2     | Toktz-xil-ak           | ~37     | `tzhaar_2` → TzHaar-Xil.png      |
| 3     | TzHaar-Ket-Om (Flail)  | ~75     | `tzhaar_3` → TzHaar-Mej.png      |
| 4     | Inquisitor's Mace      | ~100    | `tzhaar_4` → TzKal-Zuk.png       |

#### Slayer Tower (Ranged/Slayer weapons)
| Nível | Nome OSRS                    | Max Hit | Image Key                              |
|-------|------------------------------|---------|----------------------------------------|
| 1     | Slayer Crossbow (broad bolts)| ~40     | `slayer_1` → Slayer_helmet.png         |
| 2     | Karil's Crossbow             | ~57     | `slayer_2` → Broad_bolts_detail.png    |
| 3     | Twisted Bow                  | ~89     | `slayer_3` → Leaf-bladed_battleaxe.png |
| 4     | Zaryte Crossbow              | ~100    | `slayer_4` → Slayer_helmet_%28i%29.png |

#### Toxic Tower (Toxic/Blowpipe)
| Nível | Nome OSRS                    | Max Hit | Image Key                              |
|-------|------------------------------|---------|----------------------------------------|
| 1     | Toxic Blowpipe               | ~20     | `toxic_1` → Toxic_blowpipe.png         |
| 2     | Serp. Helm Blowpipe *(upgrade fictício)* | ~28 | `toxic_2` → Serpentine_helmet.png |
| 3     | Trident of the Swamp         | ~50     | `toxic_3` → Trident_of_the_swamp.png  |
| 4     | Magma Blowpipe *(fictício — Magma Mutagen exist)* | 80 | `toxic_4` → Magma_helmet.png |

### Adicionando novas torres
- Sempre siga a hierarquia de tiers do OSRS (ex: Bronze → Iron → Steel → Mithril → Adamant → Rune → Dragon → Barrows → Crystal → Raids gear).
- O `name` deve ser o nome exato do item na Wiki.
- Os `damage`, `cooldown` e `range` devem ser baseados nos stats reais do OSRS.
  - **Cooldown**: baseado em ticks (1 tick = 0.6s = `TICK * 1000 ms`). Ex: Shortbow = 3 ticks, Crystal Bow = 5 ticks.
  - **Range**: em tiles do OSRS (1 tile ≈ 25px no engine). Ex: Bows ≈ 7–10 tiles.
  - **Damage**: max hit real do OSRS com gear médio.

---

## 4. Itens de Drop (Loot)

### Regra geral
- Itens droppados devem ser itens reais do OSRS existentes na Wiki.
- Seguir progressão de tiers: Bronze → Iron → Steel → Black → Mithril → Adamant → Rune → Dragon → Barrows → Crystal → Raids.
- Cada item deve ter uma `description` que reflete o efeito real de stats (não fictício).

### Itens de drop atuais
```
bronze_sword, iron_sword, steel_sword, mithril_sword, adamant_sword, rune_sword, dragon_sword, godsword, scythe_of_vitur
```
Esses "swords" são simplificações — idealmente use os nomes exatos: `bronze_scimitar`, `iron_scimitar`, etc., ou use armas variadas por tier.

### Tabela de drops recomendada por NPC (Wiki-accurate)
- **Goblin**: coins (3-15gp), bones, goblin mail (raro)
- **Hill Giant**: big bones, giant key, limpwurt root (raro)
- **Lesser Demon**: rune med helm (raro), chaos runes, coins
- **Green Dragon**: green dragonhide, dragon bones, coins
- **Blue Dragon**: blue dragonhide, dragon bones, coins
- **Abyssal Demon**: abyssal whip (raro), runes, coins
- **Barrows**: barrows equipment set (raro), runes, coins, blood runes
- **TzTok-Jad**: fire cape (garantido 1ª vez), tokkul
- **Vorkath**: dragonbone necklace, superior dragon bones, anti-dragon shield, vorkath's head
- **Zulrah**: tanzanite fang, magic fang, serpentine visage, onyx bolts, runes

### Exemplo de sistema de drop correto
```typescript
// Drop table por enemy.type baseado na Wiki do OSRS
const dropsByEnemy: Record<EnemyType, DropEntry[]> = {
  goblin: [
    { id: 'bones', name: 'Bones', type: 'accessory', bonus: {}, chance: 1.0 },
    { id: 'coins', name: 'Coins', type: 'accessory', bonus: { damage: 0 }, amount: '3-15', chance: 0.8 }
  ],
  abyssal_demon: [
    { id: 'abyssal_whip', name: 'Abyssal Whip', type: 'weapon', bonus: { damage: 30 }, chance: 1/512 },
    { id: 'rune_chainbody', name: 'Rune Chainbody', type: 'shield', bonus: { range: 5 }, chance: 0.05 }
  ]
  // ...
};
```

---

## 5. Sons (Audio)

### Regra geral
- Todos os sons devem vir de `https://oldschool.runescape.wiki/images/[filename]`.
- Formatos suportados: `.ogg`, `.wav`, `.mp3` (versão transcoded: `/transcoded/[nome].ogg/[nome].ogg.mp3`).
- Use o formato transcoded `.mp3` quando o `.ogg` direto não funcionar no browser.

### Sons atuais mapeados
| Key no Engine      | URL Wiki                                            |
|--------------------|-----------------------------------------------------|
| shoot_archer       | Longbow_attack.wav                                  |
| shoot_wizard       | Wind_Strike.ogg                                     |
| shoot_cannon       | Fire_Strike.ogg                                     |
| shoot_tzhaar       | TzHaar-Ket_attack.ogg                               |
| shoot_slayer       | Slayer_staff_cast.ogg                               |
| hit                | Melee_hit_sound.ogg                                 |
| kill               | Zombie_death.ogg                                    |
| wave               | Teleport_sound.ogg                                  |
| upgrade/level_up   | Level_up_sound.ogg                                  |
| sell               | Coins_drop_sound.ogg                                |
| boss_attack        | Vorkath_attack_sound.ogg                            |
| prayer_on          | Protect_from_Melee.ogg (transcoded mp3)             |
| cannon_fire        | Dwarf_multicannon_fire.ogg (transcoded mp3)         |
| spell_ice          | Ice_Barrage.ogg (transcoded mp3)                    |
| death_goblin       | Goblin_death.ogg (transcoded mp3)                   |
| death_dragon       | Dragon_death.ogg (transcoded mp3)                   |
| death_demon        | Demon_death.ogg (transcoded mp3)                    |
| death_abyssal_demon | Abyssal_demon_death.ogg (transcoded mp3)           |
| death_ghost        | Ghost_death.ogg (transcoded mp3)                    |
| death_zombie       | Zombie_death.ogg (transcoded mp3)                   |
| death_cow          | Cow_death.ogg (transcoded mp3)                      |

### Adicionando novos sons
- Pesquise o nome exato do som na Wiki (ex: `Rune_crossbow_attack.ogg`).
- Adicione em `preloadSounds()` no engine.
- Formato preferido: `https://oldschool.runescape.wiki/images/transcoded/[Nome].ogg/[Nome].ogg.mp3`

---

## 6. Imagens

### Regra geral
- Todas as imagens vêm de `https://oldschool.runescape.wiki/images/[Nome_exato].png`.
- Não rotacione imagens de NPCs no draw loop — eles são renderizados de frente na Wiki.
- **Remova o `ctx.rotate()` dos inimigos** no método `draw()` — o código atual em `engine.ts` linhas ~2812–2814 rotaciona inimigos incorretamente.
- Itens com `'` ou espaços especiais usam encoding de URL (ex: `Tumeken%27s_shadow.png`).

### Mapeamento atual de imagens
```
goblin          → Goblin.png
rat             → Giant_rat.png
cow             → Cow.png
imp             → Imp.png
spider          → Giant_spider.png
scorpion        → Scorpion.png
hill_giant      → Hill_giant.png
lesser_demon    → Lesser_demon.png
green_dragon    → Green_dragon.png
blue_dragon     → Blue_dragon.png
black_demon     → Black_demon.png
abyssal_demon   → Abyssal_demon.png
barrow_wight    → Dharok_the_Wretched.png
chaos_druid     → Chaos_druid.png
skeletal_mage   → Skeletal_mage.png
skeleton        → Skeleton.png
zombie          → Zombie.png
ghost           → Ghost.png
hellhound       → Hellhound.png
fire_giant      → Fire_giant.png
bloodveld       → Bloodveld.png
gargoyle        → Gargoyle.png
nechryael       → Nechryael.png
dark_beast      → Dark_beast.png
hydra           → Hydra.png
jad             → TzTok-Jad.png
vorkath         → Vorkath.png
zulrah          → Zulrah_%28serpentine%29.png
```

### Pets e suas imagens Wiki
```
vorki           → Vorki.png
snakeling       → Pet_snakeling_%28serpentine%29.png
ikkle_hydra     → Ikkle_hydra.png
prince_black_dragon → Prince_black_dragon.png
tzrek_jad       → TzRek-Jad.png
beaver          → Beaver.png
tangleroot      → Tangleroot.png
heron           → Heron.png
baby_mole       → Baby_mole.png
rock_golem      → Rock_golem.png
rift_guardian   → Rift_guardian.png
kalphite_princess → Kalphite_princess_%28flying%29.png
```

---

## 7. Mecânicas de Jogo Baseadas no OSRS

### Ticks
- **1 game tick = 0.6 segundos** (constante `TICK = 0.6` no engine).
- Cooldowns de torre SEMPRE em múltiplos de ticks: `N * TICK * 1000` ms.
- Referências OSRS:
  - Shortbow: 3 ticks (1.8s)
  - Crystal Bow: 5 ticks (3.0s)
  - Crossbow: 5 ticks (3.0s)
  - Magic spells: 5 ticks (3.0s)
  - Dwarf Cannon: 2 ticks (1.2s)
  - Toxic Blowpipe: 2 ticks (1.2s)
  - Melee: 4 ticks (2.4s) padrão

### Damage Rolls
- OSRS usa `roll = random(0, max_hit)`. No engine: `damage = Math.floor(Math.random() * maxHit)`.
- O engine atual usa `minHit = maxHit * 0.9` para evitar zeros — isso é aceitável como simplificação.
- Para canhão: `0 to maxHit` (inclui zeros/splashes), conforme OSRS.

### Range (Tiles)
- 1 tile OSRS = 25px no engine.
- Referências de range OSRS:
  - Melee: 1 tile (25px), algumas armas 2 tiles (50px)
  - Shortbow: 7 tiles (175px)
  - Longbow/Crystal Bow: 9-10 tiles (225-250px)
  - Magic: 7-10 tiles dependendo do spell
  - Dwarf Cannon: 9 tiles (225px)
  - Chin: 9 tiles
  - Blowpipe: 5 tiles (125px)
  - Ballista: 7-9 tiles

### Prayer
- Prayers do OSRS mapeadas corretamente:
  - `thick_skin` → +5 Defence
  - `burst_of_strength` → +5 Strength
  - `clarity_of_thought` → +5 Attack
  - `sharp_eye` → +5 Ranged
  - `mystic_will` → +5 Magic
  - `piety` → +25% Attack, +23% Strength, +25% Defence
  - `rigour` → +23% Ranged, +23% Ranged Strength, +25% Defence
  - `augury` → +25% Magic, +25% Magic Defence

### Slayer
- The Slayer system must assign tasks that reflect real OSRS Slayer Masters.
- Duradel (high-level): dark_beast, abyssal_demon, hydra, gargoyle, etc.
- Turael (low-level): goblin, rat, spider, cow, ghost, zombie.
- Mazchna (mid): scorpion, hill_giant, lesser_demon, hellhound.

### Special Attacks (Specs)
- Specs baseadas nos specs reais do OSRS:
  - **Magic Shortbow**: dispara 2 flechas com -15% accuracy penalty (ignorado no engine).
  - **Crystal Bow**: sem spec — simplificado como 1.5× dano guaranteed.
  - **Dragon Dagger**: 4 rapidhits com chance de hit duplo.
  - **Abyssal Whip**: transfere run energy (no engine: slow effect no alvo).
  - **Inquisitor's Mace**: +0.5% dano por peça de inquisitor outfit.
  - **Zaryte Crossbow**: bypassa armadura, hitting through defense.
  - **Dragon Hunter Ballista (fictício)**: 1.5× dano contra dragões.

---

## 8. Quests

### Regra geral
- Quests devem ser baseadas em quests reais do OSRS, com objetivos temáticos.
- Rewards devem refletir o que a quest real oferece no OSRS.

### Quests atuais
| ID             | Nome OSRS               | Objetivo                | Reward real no OSRS         |
|----------------|-------------------------|-------------------------|-----------------------------|
| cooks_assistant | Cook's Assistant       | Matar 20 Goblins        | Acesso ao cozinheiro        |
| dragon_slayer  | Dragon Slayer           | Matar 5 Green Dragons   | Rune plate, acesso         |
| wave_master    | —                       | Chegar na wave 10       | —                          |
| demon_slayer   | Demon Slayer            | Matar 50 Lesser Demons  | Silverlight                |
| dragon_master  | —                       | Matar 10 Blue Dragons   | Dragon Scimitar            |

### Novas quests válidas
- Monkey Madness → recompensa: Dragon Scimitar ou Zenyte Shard
- Desert Treasure → recompensa: Ancient Magicks (unloca modo ancients no wizard)
- Regicide → recompensa: Crystal Bow desbloqueado
- Underground Pass → recompensa: Iban's Staff
- Sins of the Father → recompensa: Vyre Noble Outfit (accessory de mana regen)

---

## 9. Pets

### Regra geral
- Todos os pets devem existir no OSRS.
- Bônus devem refletir o tema do pet (ex: Vorki → dragões → +% dano vs dragões).
- Pets são droppados dos seus respectivos bosses com as raridades da Wiki.

### Pets OSRS confirmados
| Pet                  | Fonte          | Imagem Wiki                          |
|----------------------|----------------|--------------------------------------|
| Vorki                | Vorkath        | Vorki.png                            |
| Pet Snakeling        | Zulrah         | Pet_snakeling_%28serpentine%29.png   |
| TzRek-Jad            | TzTok-Jad      | TzRek-Jad.png                        |
| Prince Black Dragon  | King Black Dragon | Prince_black_dragon.png           |
| Ikkle Hydra          | Alchemical Hydra | Ikkle_hydra.png                    |
| Beaver               | Woodcutting    | Beaver.png                           |
| Tangleroot           | Farming        | Tangleroot.png                       |
| Heron                | Fishing        | Heron.png                            |
| Baby Mole            | Giant Mole     | Baby_mole.png                        |
| Rock Golem           | Mining         | Rock_golem.png                       |
| Rift Guardian         | Runecrafting   | Rift_guardian.png                    |
| Kalphite Princess    | Kalphite Queen | Kalphite_princess_%28flying%29.png   |

---

## 10. Achievements

### Regra geral
- Achievement names devem soar como OSRS Achievement Diary titles ou Quest completions.
- Evite nomes genéricos.

### Exemplos OSRS-themed
- "Novice Defender" → completa Wave 1
- "Lumbridge Survivor" → sobrevive wave 5 sem perder vida
- "Slayer Master" → completa 5 slayer tasks
- "Dragon Slayer II" → derrota Vorkath
- "Snake Pit" → derrota Zulrah
- "Fight Caves Champion" → derrota TzTok-Jad
- "Essence Hoarder" → acumula 50 Rune Essence
- "Tower Master" → tem 10 torres no campo

---

## 11. Regras de Balanceamento

### Escala de Waves
- **Waves 1-5**: inimigos básicos F2P (goblins, cows, spiders, skeletons, imps)
- **Waves 6-10**: slayer monsters baixos (scorpion, hill giant, chaos druid, lesser demon)
- **Waves 11-15**: slayer monsters médios (hellhound, fire giant, bloodveld, gargoyle)
- **Waves 16-20**: slayer monsters altos (abyssal demon, dark beast, nechryael) + Vorkath boss
- **Wave 10**: TzTok-Jad aparece (boss wave)
- **Wave 20**: Vorkath aparece (boss wave)
- **Wave 30**: Zulrah aparece (boss wave)
- **Waves 31+**: procedural com qualquer combinação de alta dificuldade

### HP Scaling
- Use o HP base do OSRS e escale com `hpScale = 1 + (wave - 1) * 0.35`.
- Este multiplicador reflete que inimigos "OSRS de alto level" substituem os fracos naturalmente.

### Reward Scaling
- GP reward base = aproximadamente 1/3 do combat level do NPC.
- Bosses pagam 10× o reward base.

### Custo de Torres
- Baseado no gp value real dos itens no OSRS GE (simplificado):
  - Shortbow: 50gp (barato, F2P)
  - Magic Shortbow: 100gp upgrade
  - Crystal Bow: 500gp upgrade (crystal shards)
  - Dwarf Cannon: 250gp (aluguel simbólico)
  - Toxic Blowpipe: 300gp (zulrah's scales)

---

## 12. Mapas / Temas

### Temas atuais
- `grass` → Lumbridge/Falador (padrão)
- `sand` → Al Kharid / Kharidian Desert
- `dark` → Wilderness / God Wars Dungeon

### Novos temas válidos (Wiki-based locations)
- `ice` → Trollheim / Fremennik Isles → fundo azul-branco
- `lava` → Mor Ul Rek (TzHaar city) → fundo laranja escuro
- `underground` → Slayer Dungeon → fundo pedra/caverna escura
- `swamp` → Morytania / Mort Myre → fundo verde escuro com névoa

---

## 13. UI e Visuals

### Fonts e cores OSRS
- Font principal do OSRS: **Runescape UI font** (pode ser aproximado com `serif` no CSS, ou importar Runescape font customizada).
- Cores da interface OSRS:
  - Fundo de painéis: `#3e2e18` (marrom escuro)
  - Borda dourada: `#c8a850`
  - Texto principal: `#ff981f` (laranja típico OSRS)
  - Texto de highlight: `#ffff00`
  - HP bar fill: `#00ff00`
  - HP bar empty: `#ff0000`
  - Prayer/XP bar: `#00ffff` ou `#ffae00`

### Damage Numbers
- Cor branca para 0 (splash)
- Cor amarela para hits normais
- Cor vermelha para hits críticos (>50 dano ou spec)
- Texto em style de OSRS: bold, pequeno, sem outline (ou com outline preto fina)

### Loot Display
- Loot no chão deve usar a imagem real do item da Wiki quando possível.
- Fallback: emoji ou ícone colorido.
- Loot deve piscar/pulsar para chamar atenção (já implementado no engine).

---

## 14. Anti-padrões — NÃO FAÇA

❌ Não crie criaturas que não existem no OSRS (ex: "Fire Goblin")  
❌ Não use nomes de itens inventados sem base no OSRS (ex: "Power Sword", "Magic Staff+3")  
❌ Não adicione mecânicas sem analogia no OSRS (ex: "build walls", "freeze time globally")  
❌ Não rotacione sprites de NPC — as imagens OSRS já têm orientação adequada  
❌ Não use sons de jogos terceiros — apenas a Wiki do OSRS  
❌ Não ajuste cooldowns/damage em valores não baseados em ticks do OSRS  
❌ Não adicione pets que não existem no OSRS  
❌ Não crie quests fictícias com nomes que soam como OSRS quests mas não existem  

---

## 15. Checklist ao Adicionar Conteúdo

Antes de adicionar qualquer asset ao projeto, verifique:

- [ ] O item/NPC existe na Wiki do OSRS? (https://oldschool.runescape.wiki/)
- [ ] O nome está exatamente correto (para URL da imagem)?
- [ ] O combat level, HP e drops são baseados na Wiki?
- [ ] O cooldown está em múltiplos de ticks (TICK = 0.6s)?
- [ ] O range está em tiles (1 tile = 25px)?
- [ ] O damage reflete o max hit real do OSRS?
- [ ] A imagem URL funciona (teste antes de commitar)?
- [ ] O som existe na Wiki e está no formato correto?
- [ ] Se é um item "fictício aprimorado", o item BASE existe no OSRS?