import {
  Box,
  Button,
  Heading,
  Link,
  VStack,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { graphql, Link as GatsbyLink } from "gatsby";
import * as React from "react";
import dayjs from "dayjs";

import { Layout } from "../components/Layout";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { OGP } from "../components/OGP";
import { useSiteMetadata } from "../hooks/useSiteMetadata";
import { buildOGImageURL } from "../utils/buildOGImageURL";

type PostSummaryData = {
  name: string;
  title: string;
  created: Date;
  updated: Date;
  html: string;
};

type PostSummaryQuery = {
  allMarkdownRemark: {
    nodes: {
      parent: {
        name: string;
      };
      frontmatter: {
        title: string;
        created: Date;
        updated: Date;
      };
      excerpt: string;
    }[];
  };
};

type PostSummaryProps = {
  name: string;
  title: string;
  created: Date;
  updated: Date;
  html: string;
};

const PostSummary = ({
  name,
  title,
  created,
  updated,
  html,
}: PostSummaryProps) => (
  <VStack
    width={"100%"}
    my={4}
    borderBottomWidth={"1px"}
    borderBottomStyle={"solid"}
    borderBottomColor={"gray.400"}
  >
    <Box>
      <Heading>
        <GatsbyLink to={`/posts/${name}`}>
          <Link as="span">{title}</Link>
        </GatsbyLink>
      </Heading>
      <Wrap spacing="1.5rem" justify="center">
        <WrapItem>作成日: {dayjs(created).format("YYYY-MM-DD")}</WrapItem>
        <WrapItem>更新日: {dayjs(updated).format("YYYY-MM-DD")}</WrapItem>
      </Wrap>
    </Box>
    <Box width={"100%"}>
      <MarkdownRenderer html={html} />
    </Box>
    <Box py="4">
      <Button as={GatsbyLink} to={`/posts/${name}`}>
        続きを読む
      </Button>
    </Box>
  </VStack>
);

type IndexPageProps = {
  data: PostSummaryQuery;
};

const convertQueryToData = (data: PostSummaryQuery): PostSummaryData[] =>
  data.allMarkdownRemark.nodes.map((node) => ({
    name: node.parent.name,
    ...node.frontmatter,
    html: node.excerpt,
  }));

const IndexPage = ({ data }: IndexPageProps) => {
  const { siteName, description, copyright } = useSiteMetadata();
  const postsData = convertQueryToData(data);
  const posts = postsData.map((postData) => (
    <PostSummary key={postData.name} {...postData} />
  ));
  return (
    <Layout>
      <OGP
        title={siteName}
        description={description}
        image={buildOGImageURL({ title: siteName, info: copyright })}
      />
      <Heading pb={4}>記事一覧</Heading>
      <VStack width="100%">{posts}</VStack>
    </Layout>
  );
};

export const query = graphql`
  query {
    allMarkdownRemark(sort: { fields: frontmatter___created, order: DESC }) {
      nodes {
        parent {
          ... on File {
            name
          }
        }
        frontmatter {
          title
          created
          updated
        }
        excerpt(format: HTML, truncate: true, pruneLength: 400)
      }
    }
  }
`;

export default IndexPage;
