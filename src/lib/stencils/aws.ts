import type { StencilPack } from "./types.js";

// AWS category colors
const COMPUTE = "#ED7100";
const STORAGE = "#7AA116";
const DATABASE = "#C925D1";
const NETWORKING = "#8C4FFF";
const SECURITY = "#DD344C";
const INTEGRATION = "#E7157B";
const ML = "#01A88D";
const MANAGEMENT = "#E7157B";
const ANALYTICS = "#8C4FFF";
const CONTAINERS = "#ED7100";

function awsStyle(resIcon: string, color: string): string {
  return `sketch=0;outlineConnect=0;fontColor=#232F3E;fillColor=${color};strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.${resIcon};`;
}

function awsGroupStyle(shape: string, color: string): string {
  return `sketch=0;outlineConnect=0;fontColor=#232F3E;fillColor=${color};strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.${shape};`;
}

export const AWS_PACK: StencilPack = {
  id: "aws",
  name: "Amazon Web Services",
  prefix: "mxgraph.aws4",
  entries: [
    // Compute
    { id: "lambda", label: "Lambda", category: "Compute", baseStyle: awsStyle("lambda", COMPUTE), defaultWidth: 60, defaultHeight: 60 },
    { id: "ec2", label: "EC2", category: "Compute", baseStyle: awsStyle("ec2", COMPUTE), defaultWidth: 60, defaultHeight: 60 },
    { id: "ecs", label: "ECS", category: "Compute", baseStyle: awsStyle("ecs", CONTAINERS), defaultWidth: 60, defaultHeight: 60 },
    { id: "eks", label: "EKS", category: "Compute", baseStyle: awsStyle("eks", CONTAINERS), defaultWidth: 60, defaultHeight: 60 },
    { id: "fargate", label: "Fargate", category: "Compute", baseStyle: awsStyle("fargate", CONTAINERS), defaultWidth: 60, defaultHeight: 60 },
    { id: "batch", label: "Batch", category: "Compute", baseStyle: awsStyle("batch", COMPUTE), defaultWidth: 60, defaultHeight: 60 },
    { id: "lightsail", label: "Lightsail", category: "Compute", baseStyle: awsStyle("lightsail", COMPUTE), defaultWidth: 60, defaultHeight: 60 },

    // Storage
    { id: "s3", label: "S3", category: "Storage", baseStyle: awsGroupStyle("s3", STORAGE), defaultWidth: 60, defaultHeight: 60 },
    { id: "ebs", label: "EBS", category: "Storage", baseStyle: awsStyle("elastic_block_store", STORAGE), defaultWidth: 60, defaultHeight: 60 },
    { id: "efs", label: "EFS", category: "Storage", baseStyle: awsStyle("elastic_file_system", STORAGE), defaultWidth: 60, defaultHeight: 60 },
    { id: "glacier", label: "Glacier", category: "Storage", baseStyle: awsStyle("glacier", STORAGE), defaultWidth: 60, defaultHeight: 60 },

    // Database
    { id: "dynamodb", label: "DynamoDB", category: "Database", baseStyle: awsStyle("dynamodb", DATABASE), defaultWidth: 60, defaultHeight: 60 },
    { id: "rds", label: "RDS", category: "Database", baseStyle: awsStyle("rds", DATABASE), defaultWidth: 60, defaultHeight: 60 },
    { id: "aurora", label: "Aurora", category: "Database", baseStyle: awsStyle("aurora", DATABASE), defaultWidth: 60, defaultHeight: 60 },
    { id: "elasticache", label: "ElastiCache", category: "Database", baseStyle: awsStyle("elasticache", DATABASE), defaultWidth: 60, defaultHeight: 60 },
    { id: "redshift", label: "Redshift", category: "Database", baseStyle: awsStyle("redshift", DATABASE), defaultWidth: 60, defaultHeight: 60 },
    { id: "neptune", label: "Neptune", category: "Database", baseStyle: awsStyle("neptune", DATABASE), defaultWidth: 60, defaultHeight: 60 },

    // Networking
    { id: "vpc", label: "VPC", category: "Networking", baseStyle: awsStyle("vpc", NETWORKING), defaultWidth: 60, defaultHeight: 60 },
    { id: "cloudfront", label: "CloudFront", category: "Networking", baseStyle: awsStyle("cloudfront", NETWORKING), defaultWidth: 60, defaultHeight: 60 },
    { id: "route53", label: "Route 53", category: "Networking", baseStyle: awsStyle("route_53", NETWORKING), defaultWidth: 60, defaultHeight: 60 },
    { id: "elb", label: "ELB", category: "Networking", baseStyle: awsStyle("elastic_load_balancing", NETWORKING), defaultWidth: 60, defaultHeight: 60 },
    { id: "api-gateway", label: "API Gateway", category: "Networking", baseStyle: awsStyle("api_gateway", NETWORKING), defaultWidth: 60, defaultHeight: 60 },

    // Security
    { id: "iam", label: "IAM", category: "Security", baseStyle: awsStyle("iam", SECURITY), defaultWidth: 60, defaultHeight: 60 },
    { id: "cognito", label: "Cognito", category: "Security", baseStyle: awsStyle("cognito", SECURITY), defaultWidth: 60, defaultHeight: 60 },
    { id: "kms", label: "KMS", category: "Security", baseStyle: awsStyle("key_management_service", SECURITY), defaultWidth: 60, defaultHeight: 60 },

    // Integration
    { id: "sqs", label: "SQS", category: "Integration", baseStyle: awsStyle("sqs", INTEGRATION), defaultWidth: 60, defaultHeight: 60 },
    { id: "sns", label: "SNS", category: "Integration", baseStyle: awsStyle("sns", INTEGRATION), defaultWidth: 60, defaultHeight: 60 },
    { id: "eventbridge", label: "EventBridge", category: "Integration", baseStyle: awsStyle("eventbridge", INTEGRATION), defaultWidth: 60, defaultHeight: 60 },
    { id: "step-functions", label: "Step Functions", category: "Integration", baseStyle: awsStyle("step_functions", INTEGRATION), defaultWidth: 60, defaultHeight: 60 },

    // Analytics
    { id: "kinesis", label: "Kinesis", category: "Analytics", baseStyle: awsStyle("kinesis", ANALYTICS), defaultWidth: 60, defaultHeight: 60 },
    { id: "athena", label: "Athena", category: "Analytics", baseStyle: awsStyle("athena", ANALYTICS), defaultWidth: 60, defaultHeight: 60 },

    // ML
    { id: "sagemaker", label: "SageMaker", category: "ML", baseStyle: awsStyle("sagemaker", ML), defaultWidth: 60, defaultHeight: 60 },
    { id: "bedrock", label: "Bedrock", category: "ML", baseStyle: awsStyle("bedrock", ML), defaultWidth: 60, defaultHeight: 60 },

    // Management
    { id: "cloudwatch", label: "CloudWatch", category: "Management", baseStyle: awsStyle("cloudwatch_2", MANAGEMENT), defaultWidth: 60, defaultHeight: 60 },
    { id: "cloudformation", label: "CloudFormation", category: "Management", baseStyle: awsStyle("cloudformation", MANAGEMENT), defaultWidth: 60, defaultHeight: 60 },
  ],
};
