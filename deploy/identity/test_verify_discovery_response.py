import unittest
from verify_discovery_response import verify

class DiscoveryResponseTests(unittest.TestCase):
    def wire(self, issuer="https://id.wandora.com.br/realms/master", status="200 OK"):
        import json
        body=json.dumps({"issuer":issuer,"authorization_endpoint":issuer+"/protocol/openid-connect/auth"}).encode()
        return ("HTTP/1.0 "+status+"\r\nContent-Type: application/json\r\n\r\n").encode()+body
    def test_valid_http_crlf(self):
        self.assertEqual(verify(self.wire())["issuer"],"https://id.wandora.com.br/realms/master")
    def test_status_without_reason_phrase(self):
        self.assertIn("issuer",verify(self.wire(status="200")))
    def test_bootstrap_unavailable_rejected(self):
        with self.assertRaises(ValueError): verify(self.wire(status="503 Service Unavailable"))
    def test_wrong_issuer_rejected(self):
        with self.assertRaises(ValueError): verify(self.wire(issuer="http://localhost:8080/realms/master"))
if __name__ == "__main__":
    unittest.main()
