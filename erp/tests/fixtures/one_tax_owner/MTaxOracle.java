// Oracle for witness_one_tax_owner.js — MTax.calculateTax copied VERBATIM from
// org.adempiere.base/src/org/compiere/model/MTax.java:340-367 (iDempiere), run on real java.math.BigDecimal.
// Input line (TAB): rate \t isSummary(Y/N) \t childRates(';'-joined, may be empty) \t incl(0/1) \t scale \t amount
// Output line: the tax amount toPlainString().
import java.math.*; import java.io.*; import java.util.*;
public class MTaxOracle {
  static final BigDecimal ONEHUNDRED = new BigDecimal(100);
  static BigDecimal calc(BigDecimal rate, boolean summary, String[] kids, BigDecimal amount, boolean taxIncluded, int scale) {
    if (rate.signum() == 0) return BigDecimal.ZERO;                                   // MTax.java:343 isZeroTax (:310 getRate().signum()==0)
    BigDecimal[] taxarray = new BigDecimal[summary ? kids.length : 1];                // :346-350 isSummary ? getChildTaxes(false) : {this}
    if (summary) for (int i = 0; i < kids.length; i++) taxarray[i] = new BigDecimal(kids[i]); else taxarray[0] = rate;
    BigDecimal tax = BigDecimal.ZERO;                                                  // :352
    for (BigDecimal r : taxarray) {                                                    // :353
      BigDecimal multiplier = r.divide(ONEHUNDRED, 12, RoundingMode.HALF_UP);          // :354
      if (!taxIncluded) { tax = tax.add(amount.multiply(multiplier).setScale(scale, RoundingMode.HALF_UP)); }   // :355-359
      else { multiplier = multiplier.add(BigDecimal.ONE);                              // :362
        BigDecimal base = amount.divide(multiplier, 12, RoundingMode.HALF_UP);         // :363
        tax = tax.add(amount.subtract(base).setScale(scale, RoundingMode.HALF_UP)); }  // :364-365
    }
    return tax;                                                                        // :371
  }
  public static void main(String[] a) throws Exception {
    BufferedReader br = new BufferedReader(new InputStreamReader(System.in)); String l; StringBuilder sb = new StringBuilder();
    while ((l = br.readLine()) != null) { String[] f = l.split("\t", -1);
      String[] kids = f[2].isEmpty() ? new String[0] : f[2].split(";");
      sb.append(calc(new BigDecimal(f[0]), f[1].equals("Y"), kids, new BigDecimal(f[5]), f[3].equals("1"), Integer.parseInt(f[4])).toPlainString()).append('\n'); }
    System.out.print(sb);
  }
}
