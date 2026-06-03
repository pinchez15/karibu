import unittest


def test_pipeline_package_imports() -> None:
    import karibu_case_generation

    assert karibu_case_generation.__version__ == "0.1.0"


class ScaffoldTest(unittest.TestCase):
    def test_pipeline_package_imports(self) -> None:
        import karibu_case_generation

        self.assertEqual(karibu_case_generation.__version__, "0.1.0")


if __name__ == "__main__":
    unittest.main()
