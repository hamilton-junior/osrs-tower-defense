# Classic Mode — Tower Gear (design)

**Data:** 2026-08-03

**Goal:** dar ao **Classic mode** o sistema-assinatura que hoje ele não tem —
gear OSRS dropado no run, equipado nas torres, preso ao estilo de ataque, somado
por cima de tier (T1–T4) e XP de combate. É o contraponto ao *draft por wave* do
roguelite.

**Idioma:** prosa em pt-BR; **toda string de jogo e identificador de código em
inglês**. Assets só do cache OSRS.

---

## Achados que aterram o design (nada é suposição)

- **O modo já existe.** [`GameMode = 'classic' | 'roguelite'`](../../../lib/game/core/engine.ts)
  (engine.ts:114). O roguelite tem o draft como sistema-assinatura; o classic é
  literalmente "TD puro", sem loop que o distinga. O gear preenche esse vazio e
  fica gated a `gameMode === 'classic'`, espelhando como draft/`runFx` são gated
  ao roguelite (`this.gameMode !== 'roguelite'` guarda o draft hoje).
- **A estrutura de equipamento já está no `Tower`:**
  `equipment: { weapon: Item | null; shield: Item | null; accessory: Item | null }`
  ([types.ts:372](../../../lib/game/types.ts)), ociosa no core novo. Reusamos.
- **O estilo de cada torre já está definido** e bate exatamente com o combinado:
  `TOWER_STYLES` ([towers.ts:11](../../../lib/game/data/towers.ts)) → archer/toxic/
  **cannon = ranged**, wizard = magic, tzhaar/slayer = melee. `CombatStyle =
  'ranged'|'magic'|'melee'` (types.ts:254).
- **O amarre por nível já tem máquina pronta:** `styleSkillKey`,
  `towerCombatLevel(tower)` e `tierGateFor` em
  [`systems/tower-xp.ts`](../../../lib/game/systems/tower-xp.ts) já gateiam o
  upgrade de tier pelo nível de combate da torre (na skill do seu estilo:
  strength/ranged/magic). O requisito de gear reusa `towerCombatLevel`.
- **O `Item` já carrega o bônus certo:** `bonus:{damage?,range?,cooldown?,xpBonus?}`,
  `type:'weapon'|'shield'|'accessory'|…` (types.ts:303). Os pesos de melee já
  existem em [`items.ts`](../../../lib/game/data/items.ts) (scimitares por tier,
  whip, scythe, twisted bow, amulet of power…).
- **Cuidado com `cannon: boostable:false`** (towers.ts:14): o canhão ignora
  potions/prayers/boosts por identidade (dano fixo). Gear NÃO é um "boost" — é um
  **modificador de base** somado antes, então o canhão equipa normalmente; só não
  podemos rotear o bônus de gear pela via de "boost".

## Decisões (todas confirmadas com o usuário)

1. Gear **soma sobre** tier + XP (não substitui).
2. **Gated ao Classic** (`gameMode === 'classic'`).
3. **Preso ao estilo** + à classe de arma da torre no slot de arma; acessório é
   universal. **2 slots no MVP** (arma + acessório); **escudo fica pra depois**.
4. **Híbrido:** comum = bônus plano (`Item.bonus`); raro de boss = **efeito-
   assinatura** (keyword).
5. **Aquisição:** drop **dentro do run** → bolsa de loot do run → equipar. **Só
   dura o run** (consistente com "estado de run não persiste"). **Craft de alguns
   gears fica pra depois**, com as skills novas.
6. **Requisito de nível:** cada tier de gear pede um nível de combate mínimo (na
   skill do estilo da torre) pra equipar, reusando `towerCombatLevel`.

## Fantasia / porquê

O roguelite pergunta "que carta eu drafto esta wave?"; o Classic passa a
perguntar "que gear caiu e em qual torre ele brilha?". A torre luta → ganha XP →
sobe nível → destrava empunhar gear melhor → o gear (comum) engrossa os números e
(raro) muda como ela atira. É a fantasia de montar uma conta OSRS, dentro de um
run, sem inflar ouro (o gear é recompensa não-monetária de loot).

---

## Arquitetura

Segue o padrão do core: **lógica pura em `systems/` (testada)**, o **engine
orquestra e guarda estado**, o **renderer/`GameRoot` apresentam**. O gear entra
como uma camada gated ao modo, análoga ao `runFx` do roguelite.

### 1. Dados — `lib/game/data/gear.ts` (novo) + campos em `Item`

Um arquivo próprio pro **pool equipável do Classic**, separado do `items.ts`
legado (que mistura ervas/seeds/potions). Campos novos, opcionais, no `Item`
(types.ts) — todos aditivos, não quebram nada existente:

```ts
// em Item:
style?: CombatStyle;      // arma: preso a este estilo. Ausente = universal (acessório).
weaponClass?: WeaponClass; // arma: 'scimitar'|'maul'|'bow'|'blowpipe'|'cannonball'|'staff'
levelReq?: number;         // nível de combate (na skill do estilo) pra equipar. Ausente = 1.
gearEffect?: GearEffectId; // assinatura do raro. Ausente = só stats (comum).
rarity?: 'common' | 'signature'; // pesa o drop; assinatura só cai de boss
```

O slot é o `Item.type` que já existe (`'weapon'|'accessory'|'shield'`) — não
precisa de campo novo. No MVP só usamos `weapon` e `accessory`.

`WeaponClass` e `GearEffectId` são unions novos em types.ts. `weaponClass` é o que
faz um **arco só caber no archer** e **munição só no cannon**, mesmo os dois sendo
`ranged` — cada torre tem sua classe de arma:

| Torre  | Estilo | `weaponClass` | Linha comum (exemplos) | Raro-assinatura |
|--------|--------|---------------|------------------------|-----------------|
| tzhaar | melee  | `maul`        | (obby maul tiers)      | —               |
| slayer | melee  | `scimitar`    | bronze→dragon scimitar | Darklight       |
| archer | ranged | `bow`         | shortbow→magic shortbow| Twisted bow     |
| toxic  | ranged | `blowpipe`    | blowpipe tiers         | —               |
| cannon | ranged | `cannonball`  | cannonball→granite     | —               |
| wizard | magic  | `staff`       | staff tiers            | (staff marquee) |

O **acessório** (amulet of power, combat bracelet) é `style` ausente → cabe em
qualquer torre; ainda respeita `levelReq`.

### 2. Lógica pura — `lib/game/systems/tower-gear.ts` (novo, testado)

```ts
// pode a torre equipar esta peça neste slot?
canEquip(tower, gear): { ok: boolean; reason?: 'style'|'class'|'level'|'slot' }
//   arma:      gear.style === TOWER_STYLES[tower.type].style
//           && gear.weaponClass === weaponClassFor(tower.type)
//           && towerCombatLevel(tower) >= (gear.levelReq ?? 1)
//   acessório: (gear.style undefined) && towerCombatLevel(tower) >= (gear.levelReq ?? 1)

// soma dos bônus de todo gear equipado, pra dobrar no pipeline de stats
gearStatBonus(tower): { damage: number; range: number; cooldownMult: number; xpBonus: number }

weaponClassFor(type: TowerType): WeaponClass  // o mapa da tabela acima
```

Testes: matriz de `canEquip` (estilo certo/errado, classe certa/errada, nível
abaixo/no limite, acessório universal), e soma de `gearStatBonus` (vazio, 1 peça,
2 peças, cooldown como multiplicador).

### 3. Engine — estado + métodos (gated ao Classic)

- **Bolsa de loot do run:** `lootBag: Item[]` (gear dropado ainda não equipado),
  run-scoped, **não persiste** (limpa no restart, como o resto do estado de run).
- **Drops:** no roll de loot (systems/loot `rollItemDrops`), **só em classic**,
  gear rolado entra na `lootBag` (comum de kills normais em chance baixa;
  assinatura só de boss). Fora do classic o roll de gear é no-op.
- **Métodos:**
  - `equipGear(towerId, gearId)` — valida `canEquip`, move da `lootBag` pro
    `tower.equipment[slot]`; devolve o antigo à bolsa; `bumpTowerConfig()`.
  - `unequipGear(towerId, slot)` — devolve à bolsa; `bumpTowerConfig()`.
- **Aplicação dos stats:** `gearStatBonus(tower)` dobrado em
  [`calculateTowerStats`](../../../lib/game/systems/tower-combat.ts) como
  **modificador de base** (antes dos multiplicadores; ver a ressalva do
  `boostable:false` do canhão).
- **Efeitos-assinatura:** plugados no bloco de disparo do engine, **ao lado dos
  transforms do roguelite**, disparando por `tower.equipment.weapon?.gearEffect`.
  MVP: whip (cadência mais rápida), twisted bow (dano escala com o maxHp/afinidade
  mágica do alvo), scythe (acerta em linha), Darklight (bônus vs categoria — pode
  reusar `slayerWeaponBonus`).
- **UIState:** `lootBag` vira chave nova de `UIState` (emitida no patch);
  `equipment` já viaja como parte da torre (lido live via `towerConfigSeq`, como
  os outros campos vivos da torre).

### 4. UI — `components/game/GameRoot.tsx`

- **Bolsa de loot:** um `MovablePanel` (id próprio, ex. `lootbag`) listando o gear
  dropado, **só quando `ui.gameMode === 'classic'`**. Ícone vivo de cada peça.
- **Slots na torre:** no painel single-tower, **2 slots** (arma + acessório)
  mostrando o **ícone vivo** do item equipado (nunca placeholder). Clique no slot
  → picker do gear **compatível** da bolsa (filtro `canEquip`); incompatível por
  nível aparece travado com "requires Lvl N". Desequipar devolve à bolsa.
- **Tutorial (obrigatório espelhar):** `LEARN_STEPS` + `TLDR` ganham a mecânica de
  gear (contexto Classic). Novo anchor `data-tut` (ex. `gear`).

### 5. Assets (faseado)

Melee já existe. **Autorar** ícones ranged (bow/blowpipe/cannonball) e magic
(staff) do cache OSRS via `render-osrs-items.mjs`. O plano entrega por estilo pra
nenhuma torre ficar sem gear ao ligar o modo.

---

## Fronteira do MVP

**Entra:** 2 slots (arma+acessório), gating estilo+classe+nível, comum plano +
~3–5 raros-assinatura, drop no run + bolsa + UI de equipar, gating ao Classic,
tutorial espelhado, `systems/tower-gear.ts` testado.

**Fica pra depois (registrado, não construído agora):** slot de escudo + regra de
2h; **craft** de gear com skills novas; qualquer **banco persistente** entre runs.

## Verificação

- `systems/tower-gear.ts` coberto por `*.test.ts` (a matriz de `canEquip`, a soma
  de stats).
- Gate: `npx tsc --noEmit` + `npx vitest run` + `npm run build`.
- Headless (game-verify): bolsa aparece só no Classic; equipar um gear compatível
  muda os stats da torre; incompatível por nível fica travado; nada disso aparece
  no roguelite.
- **Balanceamento é do usuário** — sem checklist de playtest.
