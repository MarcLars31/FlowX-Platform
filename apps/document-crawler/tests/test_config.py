from pathlib import Path

import pytest

from document_crawler.config import load_config


def test_supplier_id_cannot_escape_download_directory(tmp_path: Path) -> None:
    template = Path(__file__).parents[1] / "config" / "suppliers.toml"
    content = template.read_text(encoding="utf-8").replace(
        'id = "viking"',
        'id = "../../outside"',
        1,
    )
    config = tmp_path / "suppliers.toml"
    config.write_text(content, encoding="utf-8")

    with pytest.raises(ValueError, match="Supplier id may contain only"):
        load_config(config)
