# Arena Duel

A 3D first-person 1v1 arena shooter against an AI, built with Three.js + Vite.

## Run

```
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Weapons

| Weapon | Health | Speed | Notes |
|--------|--------|-------|-------|
| Sword  | 200 | +45% | 100 damage melee, fastest fighter, **double jump** |
| Fists  | 300 | +35% | 75 damage melee, faster swings, more health |
| Pistol | 250 | +15% | 16 damage per bullet (32 headshot), 24-round mag, **right-click Fan Fire** dumps the whole mag, very high fire rate, hold to fire |
| Sniper | 200 | -15% | 80 body damage, headshot is always a one-shot kill, right-click to scope |
| Hammer | 400 | +15% | 90 damage overhead slam, slow swings |
| Shotgun | 600 | -10% | Large (1.25x size and hitbox). LMB blast: 10 pellets x 15, full damage to 5m, down to 25% at 16m. RMB choke shot: 6 tight pellets x 10, no falloff to 20m. 6 shells |

## Abilities

Shift and E are on cooldowns. Q is the ultimate: it charges over time and from dealing/taking damage, and the charge carries over between rounds.

| Weapon | Shift | E | Q (Ultimate) |
|--------|-------|---|--------------|
| Sword  | **Swift Dash** (4s): dash forward, 50 dmg if you slice through the enemy | **Deflect** (8s): 1.2s of reflecting bullets back and parrying melee (stuns attacker) | **Blade Fury**: 7s of +1.5m reach, fast swings, +25% speed, 1s dash cooldown |
| Fists  | **Rocket Punch** (6s): charge forward, 45 dmg + knockback + stun | **Iron Skin** (10s): 120 HP shield for 4s | **Meteor Slam**: leap to where you aim, 70 dmg + 1.5s stun in 5.5m |
| Pistol | **Combat Roll** (4s): roll and instantly reload | **Flashbang** (9s): blind + 1.3s stun + 35 dmg in 5.5m | **Deadeye**: 5s of infinite ammo, +50% fire rate, lock-on near crosshair |
| Hammer | **Shockwave** (6s): ground slam in front, 40 dmg + knockback + short stun | **Fire Wave** (9s): 3m-wide wall of fire rolls 20m forward, 30 dmg + 24 burn over 3s | **Juggernaut**: 7s stun/knockback immunity, 50% damage reduction, +30% speed, swings hit all around |
| Shotgun | **Chain Hook** (7s): 22m hook, 20 dmg and yanks the enemy to you | **Patch Up** (14s): instantly heal 300 HP | **Dragon's Breath**: 6s of no reloading, 40% faster pumps, every hit sets the target on fire |
| Sniper | **Grapple** (7s): zip to the surface you aim at (30m) | **Recon Pulse** (12s): see the enemy through walls for 6s | **Railgun**: 8s of wall-piercing shots, faster bolt, enemy revealed |

The AI uses its abilities too. On Normal/Hard it also waits out your Deflect instead of shooting into it.

## Practice range

Hit **🎯 Practice Range** in the menu for a training ground with 8 dummies (close, mid, far sniper lane, one on a platform, one behind a wall). Dummies can't die: when "killed" their HP resets, and after 3s without damage they heal and return to their spot. Damage numbers float over hits, the top-left panel tracks combo damage and DPS, keys **1–6** switch fighter on the spot, and your ultimate charges 8x faster.

## Controls

WASD move · Space jump · Mouse aim · Left click / **F** attack · Right click / **C** scope or alt fire (Fan Fire, Choke Shot) · R reload · Shift/E abilities · Q ultimate · Esc pause

### Playing on a TrackPoint or touchpad

Clicking while steering the camera with a laptop TrackPoint (the red nub) or touchpad is awkward, so:

- **F / C** fire and alt-fire from the keyboard, so your mouse hand only has to aim.
- **Aim assist** (menu: Off / Light / Strong): the camera slows down while your crosshair is over an enemy, and gently pulls toward the nearest target while you're firing.
- Mouse sensitivity goes up to **6.0** for slow pointing devices.

First to 3 rounds wins. Sides swap every round. The AI sniper shows a red laser while it aims, so break line of sight!
