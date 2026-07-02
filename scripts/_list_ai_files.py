import os
d = r'D:\AI 竞赛'
files = [f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f))]
for f in files:
    print(repr(f), os.path.getsize(os.path.join(d, f)))
