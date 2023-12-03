---
title: "演算子の結合規則のバリエーションについて"
created: 2023-12-04
updated: 2023-12-04
description: |
  演算子には左結合や右結合といった結合規則が存在します。
  最近RPrecという演算子の優先順位に基づく構文解析の実装を行なったため、これらについて理解が深まりました。
  この記事では、そこで行なった、演算子の結合規則のバリエーションについて考察についてまとめます。
category: 形式言語
---

最近[RPrec](https://github.com/makenowjust/rprec)という演算子の優先順位に基づいて構文解析を行うRubyのライブラリを実装しました。
その中で、演算子の優先順位と結合順位についての理解が深まりました。

演算子の**優先順位** (_precedence_) というのは、`1 + 2 * 3`が`1 + (2 * 3)`と解釈されて「`*`は`+`よりもつよく結合する」というように言われるものです。
この優先順位はJavaScriptであれば[この辺り](https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Operators/Operator_precedence)に、Rubyであれば[この辺り](https://docs.ruby-lang.org/ja/latest/doc/spec=2foperator.html)にまとまっています。

そして、演算子の**結合規則** (_associativity_) というのは、左結合とか右結合とか言われるものです。
`1 + 2 + 3`は`(1 + 2) + 3`と解釈されるので`+`は**左結合**であったり、`a = b = 1`が`a = (b = 1)`と解釈されるので`=`は**右結合**というようなものです。

今回は、この演算子の結合規則のバリエーションについて考察したことについて、まとめたいと思います。

**想定読者**: 構文解析やプログラミング言語の構文に興味があり、これらについて多少の知識があることを想定しています。

<!-- read more -->

# RPrec

[RPrec](https://github.com/makenowjust/rprec)はRubyで書かれた演算子の優先順位に基づく構文解析の実装です。
演算子の優先順位をRubyのDSLで記述して、レキサーを用意することで構文解析が行えます。

`README.md`から取ってきた例ですが、次のコードは四則演算を含む簡単な式の構文を定義して、パースしています。

```ruby
grammar = RPrec::DSL.build do
  prec :main => :add_sub

  prec :add_sub => :mul_div do
    left_assoc '+' do |left, op_tok, right|
      [:add, left, right]
    end
    left_assoc '-' do |left, op_tok, right|
      [:sub, left, right]
    end
  end

  prec :mul_div => :unary do
    left_assoc '*' do |left, op_tok, right|
      [:mul, left, right]
    end
    left_assoc '/' do |left, op_tok, right|
      [:div, left, right]
    end
  end

  prec :unary => :atom do
    prefix '+' do |op_tok, expr|
      [:plus, expr]
    end
    prefix '-' do |op_tok, expr|
      [:minus, expr]
    end
  end

  prec :atom do
    closed 'INT' do |int_tok|
      [:nat, int_tok.value]
    end
    closed '(', :add_sub, ')' do |lpar_tok, expr, rpar_tok|
      [:paren, expr]
    end
  end
end

lexer = RPrec::RegexpLexer.new(
  skip: /\s+/,
  pattern: %r{
    (?<digits>\d+)|
    (?<op>[-+*/()])
  }x
) do |match|
  if (value = match[:digits])
    ['INT', value.to_i]
  elsif (op = match[:op])
    op
  else
    raise ScriptError, 'Unreachable'
  end
end

grammar.parse(lexer.lex('1 + 2 * 3'))
# => [:add, [:int, 1], [:mul, [:int, 2], [:int, 3]]]
```

RPrecを実装するにあたって、演算子の優先順位を使った構文解析について調査・考察しました。
とくに**結合規則のバリエーション**についての理解が深まったため、この記事ではそれについて説明したいと思います。

演算子の優先順位を使った構文解析については、次の論文を参考にしました。

> Danielsson, Nils Anders, and Ulf Norell. "[Parsing mixfix operators.](https://link.springer.com/chapter/10.1007/978-3-642-24452-0_5)"
> Implementation and Application of Functional Languages: 20th International Symposium, IFL 2008, Hatfield, UK, September 10-12, 2008
> Revised Selected Papers 20. Springer Berlin Heidelberg, 2011.

こちらも面白い論文ですので、興味があったらぜひ目を通してみてください。

# 結合規則のバリエーション

最初に演算子の種類や優先順位、結合規則について確認します。
そして、優先順位と結合規則の関係から結合規則のバリエーションを考えていきます。

## 演算子の種類・優先順位・結合規則

まずはじめに、演算子の種類 (fixity) について確認します。
演算子は`+`や`*`などの二項 (中置) 演算子の他に、`!`のような前置演算子や配列の参照の`[]`のような後置演算子が存在します。
これらの関係を表で整理します。

| 演算子の種類                 | 説明                           |
| ---------------------------- | ------------------------------ |
| 二項 (中置) 演算子 (_infix_) | 演算子の**前後**に他の式がくる |
| 前置演算子 (_prefix_)        | 演算子の**後**に他の式がくる   |
| 後置演算子 (_postfix_)       | 演算子の**前**に他の式がくる   |

また、これらの種類の他に整数などのリテラルや括弧で囲まれた式のような、演算子を含まない**閉じた** (_closed_) 式も構文には含まれます。

演算子には種類とは別に**優先順位** (_precedence_) が存在します。
これは、複数の演算子が一つの式に並んでいるときに、どのように結合するかを決めるための順位です。
例えば、`*`は`+`よりも優先順位が高い演算子です。
そのため、`1 * 2 + 3`は`(1 * 2) + 3`のように解釈されます。
しかし、優先順位が同じ演算子が並んでいる場合、例えば`1 + 2 + 3`のような場合はどのように解釈されるのでしょうか？

このような、同じ優先順位の演算子が並んでいる場合の結合方法を決めるための規則が、**結合規則** (_associativity_) です。
二項演算子の結合規則には主に、**左結合** (_left associative_) と**右結合** (_right associative_)が存在します。

左結合は同じ優先順位の演算子が並んだときに、左側か結合していく結合規則です。
例えば`+`はそのような演算子で`1 + 2 + 3`は`(1 + 2) + 3`のように解釈されます。
左結合は一番ポピュラーな結合規則で、`+`や`*`などの多くの演算子がこの結合規則になっています。

右結合は同じ優先順位の演算子が並んだときに、右側から結合していく結合規則です。
変数の代入に使う`=`はそのような演算子で、`a = b = 1`は`a = (b = 1)`のように解釈されます。
左結合と比べると右結合の演算子は多くありませんが、累乗を表す `**` 演算子や、三項演算子`... ? ... : ...`は右結合として扱われることが多いです[^php-ternary]。

右結合の式と左結合の式は、たとえ両方が同じ優先順位だったとしても並べられないものとします。

[^php-ternary]: ただし、PHP 7までの三項演算子は左結合になっており、`1 ? 2 : 3 ? 4 : 5`が`(1 ? 2 : 3) ? 4 : 5`として解釈されるので注意してください。現在は後方互換性の観点から非結合になっているようです。参考: <https://www.php.net/manual/ja/language.operators.precedence.php>

## 二項演算子の優先順位と結合規則

演算子の前後に入ることのできる式の優先順位と、結合規則の関係について考えてみます。

まず、左結合の演算子について考えます。
左結合の演算子の前 (左側) の式には同じ優先順位までの演算子の式が入ることができます。
そして、後 (右側) の式には必ずそれよりも高い優先順位の演算子の式が入らなければいけません。

右結合の演算子の場合、演算子の前 (右側) の式はより高い優先順位の演算子の式でなければならず、後 (右側) の式には同じ優先順位までの演算子の式が入ります。

この関係を表にして整理してみましょう。
ここで、`↑`はより高い優先順位の演算子でなければいけないことを、`=`は同じ優先順位までの演算子の式が入ることを表します。

| 結合規則 | 前 (左側) | 後 (右側) |
| -------- | --------- | --------- |
| 左結合   | `=`       | `↑`       |
| 右結合   | `↑`       | `=`       |

こうして見ると、さらに次の2つの結合規則のバリエーションが考えられます。

1. 両側が`=`になっている結合規則
2. 両側が`↑`になっている結合規則

しかし「両側が`=`になっている結合規則」はどこで結合すればいいのか分からずナンセンスです。

一方「両側が`↑`になっている結合規則」は、少なくとも意味を考えることはできるものになっています。
このような結合規則では、両側に同じ結合順位の演算子の式が入ってはいけないため、その演算子を複数並べてはいけないことを表せます。

実は、このような結合規則は**非結合** (_non-associative_) と呼ばれるものです。
例えば、等価性をチェックする`==`演算子などは、言語によっては非結合の演算子として扱われることがあります。
`1 == 2 == 3`は`(1 == 2) == 3`と`1 == (2 == 3)`のどちらで解釈されてもあまり嬉しくないため、構文のレベルでこれを弾いてしまうことには価値があります。

## 単項演算子の優先順位

単項演算子 (前置演算子と後置演算子) についても、同様に優先順位との関係を考えてみます。

前置演算子は、その後の式には同じ優先順位までの演算子の式が入ることになります。
例えば`+ + 1`は`+ (+ 1)`のように解釈されます。
この結合の仕方は右結合と同様のため、同じ優先順位の右結合の演算子と並べることができます。

同様に、後置演算子は、その前の式に同じ優先順位までの演算子の式が入ります。
例えば`foo[1][2]`は`(foo[1])[2]`のように解釈されます。
こちらの結合の仕方は左結合と同様のため、同じ優先順位の左結合の演算子と並べることができます。

ここで重要なことは、前置演算子も後置演算子も同じ優先順位までの式が入る (前の表で `=`) ことになっていることです。
つまり、`↑`が入るようなバリエーションも考えることができます。

この`↑`が入るバリエーションを、**非結合前置演算子** (_non-associative prefix_) と**非結合後置演算子** (_non-associative postfix_) と呼ぶことにします。
これらの非結合版の前置演算子や後置演算子はあまり言及されることがありませんが、一部便利なことがあります。
例えば制御構文の`return`を前置演算子として考えたとすると、`return return 1`は`return (return 1)`として解釈されてもあまり意味がないため、構文で弾けると便利でしょう。

## 結合規則のバリエーション

最後に、結合規則のバリエーションを表にまとめておきます。

| 結合規則・種類       | 前 (左側) | 後 (右側) |
| -------------------- | --------- | --------- |
| 左結合               | `=`       | `↑`       |
| 右結合               | `↑`       | `=`       |
| 非結合               | `↑`       | `↑`       |
| 前置演算子           |           | `=`       |
| 後置演算子           | `=`       |           |
| **非結合前置演算子** |           | `↑`       |
| **非結合後置演算子** | `↑`       |           |

RPrecでは、これらの結合規則・種類を実装しています。

# あとがき

結合規則は「**左右**」なのに演算子の種類は「**前置・後置**」と、言葉遣いがブレていることは、結合規則と優先順位、さらに演算子の種類との考察をするのを難しているような気がします。

せっかくなので、RPrecを開発した理由についてメモしておきます。

RubyのパーサーのPrismは、式のパースに演算子の優先順位に基づく構文解析を利用しています。
しかし、最適化のために実装がやや独特な形になっており、単項演算子と二項演算子が絡む場合のパースが上手くいかないように見えました。
その辺りの問題を解決するために、これまでどうしているのかを調べるために実装したのが、RPrecになります。

RPrec自体は実験的なものですが、RBSの型定義なども用意してあり、使えるものになっているはずです。
これからも気が向いたときにアップデートしていくつもりなので、どうかよろしくお願いします。

それでは、最後まで目を通していただきありがとうございました。