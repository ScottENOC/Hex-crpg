from pathlib import Path

path = Path('spellPlanner.js')
text = path.read_text()
old = "    return { caster, target: candidates[0].target, spell: candidates[0].spell };\n"
new = "    return { caster, target: candidates[0].target, spell: candidates[0].spell, approachDestination: candidates[0].approachDestination };\n"
if text.count(old) != 1:
    raise SystemExit(f'Expected one Auto Heal action return, found {text.count(old)}')
path.write_text(text.replace(old, new, 1))
