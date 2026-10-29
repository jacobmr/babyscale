import sys
from loguru import logger
logger.remove()
from androguard.misc import AnalyzeAPK
apk, dexes, dx = AnalyzeAPK(sys.argv[1])
for s in dx.find_strings(sys.argv[2]):
    for cls, m in s.get_xref_from():
        print(s.get_value(), "<-", cls.name, m.name)
