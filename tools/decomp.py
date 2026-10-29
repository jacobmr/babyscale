import sys
from loguru import logger
logger.remove()
from androguard.misc import AnalyzeAPK
apk, dexes, dx = AnalyzeAPK(sys.argv[1])
pat = sys.argv[2]
out = sys.argv[3]
with open(out, "w") as f:
    for c in dx.get_classes():
        if c.is_external() or pat not in c.name:
            continue
        f.write(f"\n// ===== {c.name}\n")
        try:
            f.write(c.get_vm_class().get_source())
        except Exception as e:
            f.write(f"// decompile failed: {e}\n")
        print(c.name)
