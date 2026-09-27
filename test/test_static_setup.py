import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "active"))
from parse_static_setup import parse_setup, parse_setup_rows


class StaticSetupTests(unittest.TestCase):
    def rows(self):
        return [
            [None, "Required Members", "Optional Members", None, "Predefined Groups", "DPS", "DPS", "DPS", "SUP"],
            [None, "Delay", "Jan", None, "Serca Nightmare", "Delay", "Marcel", "Wish", "Nonna"],
            [None, "Marcel", None, None, "Serca Nightmare", "Wish", "Phil", "Mawino", None],
            [None] * 9,
            [None, "Ghonty"],
        ]

    def test_reads_independent_lists_and_preserves_roles_and_empty_slots(self):
        result = parse_setup_rows(self.rows())
        self.assertEqual(result["requiredMembers"], ["Delay", "Marcel", "Ghonty"])
        self.assertEqual(result["optionalMembers"], ["Jan"])
        self.assertEqual(len(result["predefinedGroups"]), 2)
        self.assertEqual(result["predefinedGroups"][0], {
            "raid": "Serca Nightmare",
            "slots": [
                {"role": "DPS", "name": "Delay"},
                {"role": "DPS", "name": "Marcel"},
                {"role": "DPS", "name": "Wish"},
                {"role": "Support", "name": "Nonna"},
            ],
        })
        self.assertEqual(result["predefinedGroups"][1]["slots"][-1], {"role": "Support", "name": None})

    def test_headers_can_move_and_have_extra_whitespace_or_different_case(self):
        rows = self.rows()
        rows[0][1] = " required   MEMBERS "
        rows[1][1] = " Delay "
        moved = [[None] * 11] * 3 + [[None, None] + row for row in rows]
        self.assertEqual(parse_setup_rows(moved), parse_setup_rows(self.rows()))

    def test_empty_lists_and_group_table_are_valid(self):
        self.assertEqual(parse_setup_rows(self.rows()[:1]), {
            "requiredMembers": [], "optionalMembers": [], "predefinedGroups": [],
        })

    def test_missing_and_duplicate_headers_fail_clearly(self):
        for replacement in (None, "Required Members"):
            with self.subTest(replacement=replacement):
                rows = self.rows()
                rows[0][2] = replacement
                with self.assertRaisesRegex(ValueError, "exactly one"):
                    parse_setup_rows(rows)

    def test_members_without_group_label_are_rejected(self):
        rows = self.rows()
        rows[1][4] = None
        with self.assertRaisesRegex(ValueError, "members but no raid label"):
            parse_setup_rows(rows)

    def test_missing_or_unknown_roles_are_rejected(self):
        for role in (None, "Unknown"):
            with self.subTest(role=role):
                rows = self.rows()
                rows[0][5] = role
                with self.assertRaisesRegex(ValueError, "role"):
                    parse_setup_rows(rows)

    def test_formulas_and_excel_errors_are_not_treated_as_names(self):
        for name in ('=OtherSheet!A1', '#REF!'):
            with self.subTest(name=name):
                rows = self.rows()
                rows[1][1] = name
                with self.assertRaisesRegex(ValueError, "formula or Excel error"):
                    parse_setup_rows(rows)

    def test_missing_file_has_clear_error(self):
        with patch('parse_static_setup.Path.is_file', return_value=False):
            with self.assertRaisesRegex(FileNotFoundError, "Workbook not found"):
                parse_setup('missing.xlsx')

    def test_missing_setup_sheet_closes_workbook(self):
        workbook = Mock(sheetnames=['Other'])
        with patch('parse_static_setup.Path.is_file', return_value=True), patch(
            'parse_static_setup.load_workbook', return_value=workbook
        ):
            with self.assertRaisesRegex(ValueError, "missing the 'Setup' sheet"):
                parse_setup('staticsheet.xlsx')
        workbook.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
