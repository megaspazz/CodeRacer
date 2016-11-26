public boolean find(int[][] matrix, int num) {

	int rLen = matrix.length;
	int cLen = matrix[0].length;

	int row = cLen - 1;
	int col = 0;

	while (row >= 0 && col < rLen) {
		if (num > matrix[row][col]) {
			col++;
		} else if (num < matrix[row][col]) {
			row--;
		} else {
			return true;
		}
	}
	return false;
}