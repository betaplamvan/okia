from httpx import AsyncClient


async def test_healthz(client: AsyncClient) -> None:
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


async def test_locale_from_accept_language(client: AsyncClient) -> None:
    r = await client.get("/i18n/demo", headers={"accept-language": "en-US,en;q=0.9"})
    assert r.json() == {"locale": "en", "message": "It is not your turn."}
    r = await client.get("/i18n/demo", headers={"accept-language": "fr-FR"})
    assert r.json()["locale"] == "vi"
