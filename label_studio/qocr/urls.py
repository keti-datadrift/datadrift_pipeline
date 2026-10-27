from django.urls import path, include
from . import views

app_name = "qocr"

# QOCR API endpoints
_api_urlpatterns = [
    path("parse-document/", views.ParseDocumentView.as_view(), name="parse_document"),
    path("layout/", views.LayoutView.as_view(), name="layout"),
    path("ocr/", views.OCRView.as_view(), name="ocr"),
    path("table/", views.TableView.as_view(), name="table"),
]

urlpatterns = [
    path("api/qocr/", include((_api_urlpatterns, app_name), namespace="api")),
]
