"""Convert certificates to web-friendly images and copy to workspace images/ folder."""
import os
import shutil
import pypdfium2 as pdfium

WORKSPACE_IMG = r'D:\program_file\skystar_personal_website\images'
SRC_DIR = r'D:\AI 竞赛'

# 1. Copy 初赛 PNG (regional list)
src_png = os.path.join(SRC_DIR, 'pc端-智能体决策算法-中级赛道川渝地区获奖名单.png')
dst_png = os.path.join(WORKSPACE_IMG, 'award-kaiwu-preliminary.png')
shutil.copy2(src_png, dst_png)
print(f'[OK] 初赛图片 -> {dst_png} ({os.path.getsize(dst_png)//1024} KB)')

# 2. Convert 复赛 PDF -> PNG (ranking certificate)
src_pdf = os.path.join(SRC_DIR, '算法中级-排名证书.pdf')
dst_pdf = os.path.join(WORKSPACE_IMG, 'award-kaiwu-final.pdf')
dst_pdf_png = os.path.join(WORKSPACE_IMG, 'award-kaiwu-final.png')

# Copy PDF too in case we want to embed as PDF
shutil.copy2(src_pdf, dst_pdf)
print(f'[OK] 复赛PDF -> {dst_pdf} ({os.path.getsize(dst_pdf)//1024} KB)')

# Convert PDF to PNG (render at 2x for crispness)
pdf = pdfium.PdfDocument(src_pdf)
print(f'    PDF pages: {len(pdf)}')
for i, page in enumerate(pdf):
    bitmap = page.render(scale=2.0)
    pil = bitmap.to_pil()
    out = os.path.join(WORKSPACE_IMG, f'award-kaiwu-final-page{i+1}.png')
    pil.save(out, 'PNG', optimize=True)
    print(f'[OK] 复赛PDF page {i+1} -> {out} ({os.path.getsize(out)//1024} KB)')
pdf.close()
print('DONE')
