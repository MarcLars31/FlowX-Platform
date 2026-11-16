from document_crawler.config import RelevanceSettings
from document_crawler.models import LinkContext
from document_crawler.pdf import (
    has_pdf_signature,
    infer_document_type,
    safe_stem,
    stable_filename,
)
from document_crawler.relevance import RelevanceClassifier, product_datasheet_affinity


def test_pdf_signature_rejects_html_error_page() -> None:
    assert has_pdf_signature(b"%PDF-1.7\n")
    assert not has_pdf_signature(b"<!doctype html><title>Error</title>")


def test_stable_safe_filename() -> None:
    name = stable_filename("VK 100: Tekniskt datablad?", "https://x.test/a", "ab" * 32)
    assert name == "vk-100-tekniskt-datablad-abababababab.pdf"
    assert safe_stem("CON") == "document-con"


def test_document_type_and_relevance_decisions() -> None:
    classifier = RelevanceClassifier(
        RelevanceSettings(("sprinkler", "technical data"), ("career",)), 4, 1
    )
    relevant = classifier.classify(
        LinkContext("https://x.test/vk.pdf", "Technical data sprinkler", "", "")
    )
    uncertain = classifier.classify(LinkContext("https://x.test/123.pdf"))
    excluded = classifier.classify(LinkContext("https://x.test/career.pdf", "Career"))
    assert relevant.decision == "relevant"
    assert uncertain.decision == "review"
    assert excluded.decision == "excluded"
    assert infer_document_type("Installation manual for valve") == "installation_instruction"


def test_product_datasheets_rank_ahead_of_generic_overviews() -> None:
    product = LinkContext(
        "https://www.vikinggroupinc.com/products/fire-sprinklers/vk1001",
        "VK1001 - Standard Response Upright Sprinkler (K5.6)",
    )
    datasheet = LinkContext(
        "https://www.vikinggroupinc.com/sites/default/files/102420.pdf",
        "Technical Data",
        page_title="VK1001 - Standard Response Upright Sprinkler (K5.6)",
    )
    overview = LinkContext(
        "https://www.vikinggroupinc.com/sites/default/files/080814.pdf",
        "Sprinkler Overview Technical Data Sheet",
    )

    assert product_datasheet_affinity(product) > 100
    assert product_datasheet_affinity(datasheet) > 100
    assert product_datasheet_affinity(overview) < 0
    assert infer_document_type("Sprinkler Overview Technical Data Sheet") == "product_overview"
    assert infer_document_type("VK1001 Technical Data Sheet") == "data_sheet"
    assert infer_document_type("Technical Data VK145 - CE Approval, FM Approval") == "data_sheet"
