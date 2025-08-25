import re

files = [
  'offline-worker.js',
  'k3.html',
  'manifest.json']  # Replace with your file names

version_pattern = re.compile(r'(0\.4\.)(\d+)')


def increment_version(match):
    prefix, last = match.groups()
    return f"{prefix}{int(last)+1}"


for filename in files:
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    new_content = version_pattern.sub(increment_version, content)
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(new_content)
